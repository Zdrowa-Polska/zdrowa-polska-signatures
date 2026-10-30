"""Preserve authenticated messages when optional profile formatting is ambiguous."""
import mobile_choice
import profile_runtime
import signature_optout

COSMETIC_ERRORS = frozenset({
    'Unrecognised client signature',
    'Cannot safely locate the plain signature',
    'Malformed signature markup',
    'Unclosed signature markup',
    'Cannot modify cryptographically protected message',
})


def prepare(msg, signature, replace_text_part):
    """Return a staged message, or None to deliver the complete original.

    Called only after existing sender/route authentication. Explicit signature
    instructions and unexpected failures retain their existing strict behavior.
    """
    try:
        return profile_runtime.canonicalize_message(msg, signature, replace_text_part)
    except mobile_choice.UnsafeSignature as error:
        if str(error) not in COSMETIC_ERRORS:
            raise
        for part in signature_optout.body_parts(msg):
            body = part.get_content()
            if not isinstance(body, str):
                continue
            subtype = part.get_content_subtype()
            _, explicit = signature_optout.strip_marker(body, subtype)
            if explicit:
                raise
            if subtype == 'html':
                _, choice = mobile_choice.extract_choices(body)
                if choice is not None:
                    raise
            elif mobile_choice.BASE in body[:mobile_choice.plain_current_end(body)]:
                raise
        print('PROFILE_SIGNATURE_PRESERVED reason=' + str(error), flush=True)
        return None
