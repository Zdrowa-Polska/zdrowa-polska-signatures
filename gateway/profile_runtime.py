"""One atomic Directory snapshot shared by both mail entry points."""
import json
from pathlib import Path

RUNTIME = Path('/opt/zp-sendas/profile-runtime.json')

def read_runtime():
    if not RUNTIME.exists():
        return None
    data = json.loads(RUNTIME.read_text(encoding='utf-8'))
    if data.get('version') != 1:
        raise ValueError('Unsupported profile runtime')
    return data

def signatures():
    data = read_runtime()
    return None if data is None else data['signatures']

def allowed_senders():
    data = read_runtime()
    return None if data is None else set(data['allowed_senders'])

def canonicalize_message(msg, signature, replace_text_part):
    """Replace only known company signatures in the unquoted message body.

    Work on a copy and stage edits so ambiguous MIME never loses user content.
    Cached Gmail drafts and old primary addresses are recognized by identity.
    """
    if '_known_signatures' not in signature:
        return msg
    import copy
    import mobile_choice
    result = copy.deepcopy(msg)
    if any(p.get_content_type() in ('multipart/signed', 'multipart/encrypted', 'application/pkcs7-mime')
           for p in result.walk()):
        raise mobile_choice.UnsafeSignature('Cannot modify cryptographically protected message')
    parts = [(p, p.get_content()) for p in mobile_choice.body_parts(result)]
    removed, staged = [], []
    recognition = {'text': '\n'.join(signature['_recognition_emails'])}
    templates = signature['_known_signatures']
    for part, body in parts:
        if not isinstance(body, str) or part.get_content_subtype() != 'html':
            continue
        updated = mobile_choice.remove_client_html(body, recognition, removed)
        parser = mobile_choice.SignatureSpans(updated)
        parser.feed(updated); parser.close()
        current, history = updated[:parser.current_end], updated[parser.current_end:]
        for template in templates:
            exact = template['html']
            if exact and exact in current:
                removed.append(mobile_choice.visible_text(exact))
                current = current.replace('<!-- ZP-EMPLOYEE-SIGNATURE -->' + exact, '').replace(exact, '')
        staged.append((part, current + history))
    for part, body in parts:
        if not isinstance(body, str) or part.get_content_subtype() != 'plain':
            continue
        updated = body
        # Exact old plain templates first; HTML token evidence handles Gmail's alternate text.
        for template in templates:
            updated = mobile_choice.remove_client_plain(updated, template)
        updated = mobile_choice.remove_client_plain(updated, recognition, removed)
        staged.append((part, updated))
    for part, updated in staged:
        if updated != part.get_content():
            replace_text_part(part, updated, part.get_content_subtype())
    while result.get('X-ZP-Employee-Signature-Applied'):
        del result['X-ZP-Employee-Signature-Applied']
    return result
