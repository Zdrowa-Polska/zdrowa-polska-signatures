#!/usr/bin/env python3
"""Pull complete public Directory exports; retain last good state on any failure.

Passwords/keys are never downloaded, generated, logged, or changed by this worker.
Existing SMTP logins are bound once to the immutable employee identity.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/Zdrowa-Polska/zdrowa-polska-signatures/main/data/unified-profiles.json'
EMAIL = re.compile(r'^[a-z0-9._+\-]+@zdrowapolskagroup\.pl$')
IDENTITY = re.compile(r'^[a-f0-9]{64}$')
BASE = Path('/opt/zp-sendas')
STATE = Path('/var/lib/zp-profile-sync/state.json')
LOGIN_MAP = Path('/etc/postfix/zp_sendas_sender_login')
ROUTE_MAP = Path('/etc/postfix/zp_workspace_pilot_sender')

def compile_snapshot(source, previous, login_map, seed_signatures=None):
    if (source.get('version') != 1 or source.get('complete') is not True or
        source.get('domain') != 'zdrowapolskagroup.pl' or
        not isinstance(source.get('profiles'), list) or not source['profiles']):
        raise ValueError('Incomplete Directory snapshot; keeping last good state')
    bindings = dict(previous.get('bindings', {}))
    claimed_logins = {login for names in bindings.values() for login in names}
    signatures, allowed, sender_logins = {}, set(), {}
    ids, addresses = set(), set()
    managed = set(previous.get('managed_addresses', []))
    histories = dict(previous.get('signature_history', {}))
    for p in source['profiles']:
        identity = p.get('id', '')
        if not IDENTITY.fullmatch(identity) or identity in ids:
            raise ValueError('Invalid or duplicate immutable identity')
        ids.add(identity)
        if type(p.get('active')) is not bool or type(p.get('enabled')) is not bool:
            raise ValueError('Invalid employee status')
        retired = not p['active'] and not p['enabled'] and 'email' not in p
        emails = [] if retired else [p.get('email')] + p.get('aliases', [])
        if len(emails) != len(set(emails)):
            raise ValueError('Duplicate employee address')
        for email in emails:
            if not isinstance(email, str) or not EMAIL.fullmatch(email) or email in addresses:
                raise ValueError('Invalid or conflicting employee address')
            addresses.add(email)
        if p['enabled'] and p['active']:
            if not isinstance(p.get('html'), str) or not p['html'] or not isinstance(p.get('text'), str) or not p['text']:
                raise ValueError('Missing rendered signature')
            if len(p['html']) > 200000 or len(p['text']) > 100000:
                raise ValueError('Signature exceeds limit')
        if identity not in bindings:
            # Bootstrap only a currently configured login; never reassign a previously owned login.
            candidates = {login for email in emails for login in login_map.get(email, '').split(',')
                          if EMAIL.fullmatch(login) and login not in claimed_logins}
            bindings[identity] = sorted(candidates)
            claimed_logins.update(candidates)
        managed.update(emails)
        templates = list(histories.get(identity, []))
        for email in emails:
            seed = (seed_signatures or {}).get(email)
            if seed and seed.get('html') and seed.get('text'):
                template = {'html': seed['html'], 'text': seed['text']}
                if template not in templates: templates.append(template)
        if p['enabled'] and p['active']:
            template = {'html': p['html'], 'text': p['text']}
            if template not in templates: templates.append(template)
        histories[identity] = templates[-10:]
        if not p['active']:
            continue
        for email in emails:
            allowed.add(email)
            signatures[email] = {'html': p.get('html', ''), 'text': p.get('text', ''),
                                 'enabled': p['enabled'], 'identity': identity, 'primary': p['email'],
                                 '_known_signatures': histories[identity],
                                 '_recognition_emails': sorted(set(emails + bindings[identity]))}
            if bindings[identity]:
                sender_logins[email] = ','.join(bindings[identity])
    fingerprint = hashlib.sha256(json.dumps(source, sort_keys=True).encode()).hexdigest()
    return ({'version': 1, 'source_hash': fingerprint, 'signatures': signatures,
             'allowed_senders': sorted(allowed)},
            {'version': 1, 'bindings': bindings, 'managed_addresses': sorted(managed),
             'signature_history': histories}, sender_logins)

def read_map(path):
    result = {}
    for line in path.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#'):
            key, value = line.split(None, 1)
            result[key] = value
    return result

def atomic(path, content, mode=0o640, group=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.' + path.name + '-')
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(name, mode)
        if group is not None:
            import grp
            os.chown(name, 0, grp.getgrnam(group).gr_gid)
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def update_postfix_map(path, entries):
    text = ''.join(f'{key} {value}\n' for key, value in sorted(entries.items()))
    if path.read_text() == text:
        return
    candidate = path.with_name(path.name + '.profile-sync-next')
    try:
        atomic(candidate, text.encode(), 0o644)
        subprocess.run(['/usr/sbin/postmap', str(candidate)], check=True)
        # Readers use the database, which is replaced in a single rename.
        os.replace(str(candidate) + '.db', str(path) + '.db')
        os.replace(candidate, path)
    finally:
        candidate.unlink(missing_ok=True)
        Path(str(candidate) + '.db').unlink(missing_ok=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--source-file', type=Path)
    args = parser.parse_args()
    if args.source_file:
        source = json.loads(args.source_file.read_text())
    else:
        request = urllib.request.Request(SOURCE, headers={'Cache-Control': 'no-cache', 'User-Agent': 'ZP-Profile-Sync/1'})
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read(10_000_001)
        if len(body) > 10_000_000: raise ValueError('Profile snapshot exceeds limit')
        source = json.loads(body)
    previous = json.loads(STATE.read_text()) if STATE.exists() else {}
    login_map, route_map = read_map(LOGIN_MAP), read_map(ROUTE_MAP)
    seed = json.loads((BASE / 'employee-signatures.json').read_text())
    seed = seed.get('signatures', seed)
    runtime, state, logins = compile_snapshot(source, previous, login_map, seed)
    if args.dry_run:
        print(json.dumps({'dry_run': True, 'identities': len(source['profiles']),
                          'allowed_addresses': len(runtime['allowed_senders']),
                          'smtp_addresses': len(logins), 'source_hash': runtime['source_hash']}))
        return
    # Persist identity ownership before activating any new mapping; retries are idempotent.
    atomic(STATE, json.dumps(state).encode(), 0o600)
    for email in state['managed_addresses']:
        login_map.pop(email, None)
        route_map.pop(email, None)
    login_map.update(logins)
    route_map.update({email: 'OK' for email in runtime['allowed_senders']})
    update_postfix_map(LOGIN_MAP, login_map)
    update_postfix_map(ROUTE_MAP, route_map)
    atomic(BASE / 'profile-runtime.json', json.dumps(runtime, ensure_ascii=False).encode(), group='zp-sendas')
    atomic(BASE / 'workspace-allowed-senders.json', json.dumps(runtime['allowed_senders']).encode(), group='zp-sendas')
    print(json.dumps({'synced': True, 'allowed_addresses': len(runtime['allowed_senders']),
                      'source_hash': runtime['source_hash']}))

if __name__ == '__main__':
    main()
