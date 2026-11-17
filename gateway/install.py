#!/usr/bin/env python3
"""Install additive profile-sync support after verifying exact live-code anchors."""
import argparse
import datetime
import os
from pathlib import Path
import shutil
import subprocess
import polish_quote_boundary

LOAD = 'def load_signatures():\n'
LOAD_NEW = '''def load_signatures():
    import profile_runtime
    unified = profile_runtime.signatures()
    if unified is not None:
        return unified
'''
NORMALIZE = '        gateway_safety.normalize_sender(msg, header_from)\n        optout ='
NORMALIZE_V1 = '''        gateway_safety.normalize_sender(msg, header_from)
        import profile_runtime
        msg = profile_runtime.canonicalize_message(msg, signature, replace_text_part)
        if signature.get('enabled') is False:
            reinject(mailfrom, rcpttos, smtp_bytes(msg))
            return None
        optout ='''
NORMALIZE_V2 = NORMALIZE_V1.replace(
    '        msg = profile_runtime.canonicalize_message(msg, signature, replace_text_part)',
    '        # Preserve ambiguous or signed internal messages.\n'
    '        if not recipient_policy.internal_only(msg, rcpttos):\n'
    '            msg = profile_runtime.canonicalize_message(msg, signature, replace_text_part)')
NORMALIZE_NEW = NORMALIZE_V2.replace(
    '            msg = profile_runtime.canonicalize_message(msg, signature, replace_text_part)',
    '            import profile_delivery\n'
    '            candidate = profile_delivery.prepare(msg, signature, replace_text_part)\n'
    '            if candidate is None:\n'
    '                reinject(mailfrom, rcpttos, smtp_bytes(msg))\n'
    '                return None\n'
    '            msg = candidate')
ALLOWED = "        allowed.add('test.skoki@zdrowapolskagroup.pl')"
ALLOWED_NEW = '''        import profile_runtime
        unified_allowed = profile_runtime.allowed_senders()
        if unified_allowed is not None:
            allowed = unified_allowed
        allowed.add('test.skoki@zdrowapolskagroup.pl')'''

INTERNAL_GUARD = "        if recipient_policy.internal_only(msg, rcpttos):\n            import copy\n            import mobile_choice\n            staged = copy.deepcopy(msg)\n            try:\n                optout = signature_optout.consume(staged, replace_text_part, signature)\n                if optout:\n                    recipient_policy.remove_signature(staged, signature, replace_text_part)\n                else:\n                    staged = recipient_policy.automatic_internal_message(staged, signature, replace_text_part)\n            except mobile_choice.UnsafeSignature as error:\n                # Sender/route checks above have passed. Formatting must never\n                # block internal mail; keep the complete normalized original.\n                print('INTERNAL_SIGNATURE_PRESERVED reason=' + str(error), flush=True)\n                staged = msg\n            reinject(mailfrom, rcpttos, smtp_bytes(staged))\n            return None\n"

FOOTER_GUARD = "            # A Google compliance footer can follow the verified HTML signature.\n            # Remove only the unique exact signature token span; preserve the footer.\n            if target_tokens:\n                values = [m[0] for m in tokens]\n                hits = [i for i in range(len(tokens)-len(target_tokens)+1)\n                        if values[i:i+len(target_tokens)] == target_tokens]\n                if len(hits) == 1:\n                    i = hits[0]\n                    stop = tokens[i+len(target_tokens)-1].end()\n                    tail = current[stop:]\n                    if re.match(r'\\s*--[ \\t]*\\r?\\nCONFIDENTIALITY NOTICE:', tail):\n                        prefix = current[:tokens[i].start()]\n                        prefix = re.sub(r'(?:\\s|\\[image:[^\\]]*\\])*\\Z', '', prefix, flags=re.I)\n                        current = prefix.rstrip() + '\\n\\n' + tail.lstrip('\\r\\n')\n                        break\n"
FOOTER_ANCHOR = "            if target_tokens and len(tokens) >= len(target_tokens) and [m[0] for m in tokens[-len(target_tokens):]] == target_tokens:"

def patch(source, before, after):
    if after in source:
        return source
    if source.count(before) != 1:
        raise ValueError('Live gateway differs from tested integration anchor')
    return source.replace(before, after)

def patched_sources(base):
    submission = (base/'submission_filter.py').read_text()
    submission = patch(submission, LOAD, LOAD_NEW)
    if INTERNAL_GUARD not in submission:
        if NORMALIZE_V1 in submission:
            submission = submission.replace(NORMALIZE_V1, NORMALIZE_NEW)
        if NORMALIZE_V2 in submission:
            submission = submission.replace(NORMALIZE_V2, NORMALIZE_NEW)
        submission = patch(submission, NORMALIZE, NORMALIZE_NEW)
    if INTERNAL_GUARD not in submission:
        anchor = '        optout = signature_optout.consume(msg, replace_text_part, signature)'
        submission = patch(submission, anchor, INTERNAL_GUARD + anchor)
    route = patch((base/'workspace_route_filter.py').read_text(), ALLOWED, ALLOWED_NEW)
    mobile = polish_quote_boundary.patch_source((base/'mobile_choice.py').read_text())
    marker_old = "self.stack.append((tag, self.source_position(), 'gmail_signature' in classes, protected))"
    marker_new = "self.stack.append((tag, self.source_position(),\n                               'gmail_signature' in classes or attrs.get('data-smartmail') == 'gmail_signature',\n                               protected))"
    mobile = patch(mobile, marker_old, marker_new)
    if FOOTER_GUARD not in mobile:
        mobile = patch(mobile, FOOTER_ANCHOR, FOOTER_GUARD + FOOTER_ANCHOR)
    compile(mobile, 'mobile_choice.py', 'exec')
    compile(submission, 'submission_filter.py', 'exec')
    compile(route, 'workspace_route_filter.py', 'exec')
    return {'submission_filter.py': submission, 'workspace_route_filter.py': route, 'mobile_choice.py': mobile}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base', type=Path, default=Path('/opt/zp-sendas'))
    parser.add_argument('--check-only', action='store_true')
    args=parser.parse_args()
    files=patched_sources(args.base)
    if args.check_only:
        print('Gateway integration anchors and Python syntax verified');return
    if os.geteuid()!=0:raise SystemExit('Run installer as root')
    backup=Path('/root/zp-profile-sync-backup-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700)
    for src in [args.base, Path('/etc/postfix'), Path('/etc/zp-sendas')]:
        shutil.copytree(src, backup / str(src).lstrip('/'))
    for name,content in files.items():
        temp=args.base/(name+'.profile-sync-next');temp.write_text(content)
        temp.chmod(0o644);os.replace(temp,args.base/name)
    here=Path(__file__).resolve().parent
    shutil.copy2(here/'profile_runtime.py',args.base/'profile_runtime.py')
    shutil.copy2(here/'profile_sync.py',args.base/'profile_sync.py')
    shutil.copy2(here/'profile_delivery.py',args.base/'profile_delivery.py')
    shutil.copy2(here/'internal_signature.py',args.base/'internal_signature.py')
    for name in ('zp-profile-sync.service','zp-profile-sync.timer'):
        shutil.copy2(here/name,Path('/etc/systemd/system')/name)
    subprocess.run(['systemctl','daemon-reload'],check=True)
    # Unknown newly renamed enrolled senders wait for the next Directory export instead of bouncing.
    subprocess.run(['/usr/sbin/postconf','-P',
      '0.0.0.0:2525/inet/smtpd_sender_restrictions=check_sender_access,hash:/etc/postfix/zp_workspace_pilot_sender,defer'],check=True)
    subprocess.run(['/usr/sbin/postfix','check'],check=True)
    subprocess.run(['/usr/sbin/postfix','reload'],check=True)
    subprocess.run(['systemctl','restart','zp-employee-submission-filter','zp-workspace-pilot-filter'],check=True)
    print('Installed dormant integration. Timer is NOT enabled until a validated source exists.')
    print('Backup:',backup)

if __name__=='__main__':main()


