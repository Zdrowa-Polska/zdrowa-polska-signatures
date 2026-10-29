#!/usr/bin/env python3
"""Install additive profile-sync support after verifying exact live-code anchors."""
import argparse
import datetime
import os
from pathlib import Path
import shutil
import subprocess

LOAD = 'def load_signatures():\n'
LOAD_NEW = '''def load_signatures():
    import profile_runtime
    unified = profile_runtime.signatures()
    if unified is not None:
        return unified
'''
NORMALIZE = '        gateway_safety.normalize_sender(msg, header_from)\n        optout ='
NORMALIZE_NEW = '''        gateway_safety.normalize_sender(msg, header_from)
        import profile_runtime
        msg = profile_runtime.canonicalize_message(msg, signature, replace_text_part)
        if signature.get('enabled') is False:
            reinject(mailfrom, rcpttos, smtp_bytes(msg))
            return None
        optout ='''
ALLOWED = "        allowed.add('test.skoki@zdrowapolskagroup.pl')"
ALLOWED_NEW = '''        import profile_runtime
        unified_allowed = profile_runtime.allowed_senders()
        if unified_allowed is not None:
            allowed = unified_allowed
        allowed.add('test.skoki@zdrowapolskagroup.pl')'''

def patch(source, before, after):
    if after in source:
        return source
    if source.count(before) != 1:
        raise ValueError('Live gateway differs from tested integration anchor')
    return source.replace(before, after)

def patched_sources(base):
    submission = (base/'submission_filter.py').read_text()
    submission = patch(submission, LOAD, LOAD_NEW)
    submission = patch(submission, NORMALIZE, NORMALIZE_NEW)
    route = patch((base/'workspace_route_filter.py').read_text(), ALLOWED, ALLOWED_NEW)
    compile(submission, 'submission_filter.py', 'exec')
    compile(route, 'workspace_route_filter.py', 'exec')
    return {'submission_filter.py': submission, 'workspace_route_filter.py': route}

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
