#!/usr/bin/env python3
import asyncore
import json
import os
import re
import smtplib
import smtpd
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses
from pathlib import Path

LISTEN_HOST = os.environ.get("ZP_SUBMISSION_FILTER_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("ZP_SUBMISSION_FILTER_PORT", "10027"))
REINJECT_HOST = os.environ.get("ZP_SUBMISSION_REINJECT_HOST", "127.0.0.1")
REINJECT_PORT = int(os.environ.get("ZP_SUBMISSION_REINJECT_PORT", "10026"))
SIGNATURES_FILE = Path(os.environ.get(
    "ZP_EMPLOYEE_SIGNATURES_FILE",
    "/opt/zp-signature-gateway/employee-signatures.json",
))
CORPORATE_DOMAIN = os.environ.get("ZP_CORPORATE_DOMAIN", "zdrowapolskagroup.pl").lower()

HEADER_MARKER = "X-ZP-Employee-Signature-Applied"
HTML_MARKER = '<!-- ZP-EMPLOYEE-SIGNATURE -->'
PL_DISCLAIMER_MARKER = "Niniejsza wiadomość wraz z załącznikami zawiera ściśle poufne"
EN_DISCLAIMER_MARKER = "This email with all its attachments is confidential"

HTML_QUOTE_MARKERS = (
    '<div class="gmail_quote',
    "<blockquote",
    '<div id="divrplyfwdmsg"',
    '<div class="gmail_attr"',
)

PLAIN_QUOTE_PATTERNS = (
    re.compile(r"(?im)^-{2,}\s*Forwarded message\s*-{2,}\s*$"),
    re.compile(r"(?im)^-{2,}\s*Wiadomość przekazana\s*-{2,}\s*$"),
    re.compile(r"(?im)^-----Original Message-----\s*$"),
    re.compile(r"(?im)^.+\b(?:wrote|napisał|napisała|napisał\(a\)):\s*$"),
)


def load_signatures():
    with SIGNATURES_FILE.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    signatures = payload.get("signatures", payload)
    if not isinstance(signatures, dict):
        raise ValueError("employee-signatures.json must contain an object mapping email -> signature")

    out = {}
    for email, item in signatures.items():
        address = str(email).strip().lower()
        if not address.endswith("@" + CORPORATE_DOMAIN):
            continue
        if not isinstance(item, dict) or not item.get("html") or not item.get("text"):
            continue
        out[address] = {
            "html": str(item["html"]),
            "text": str(item["text"]),
        }
    return out


def already_has_signature(text):
    value = text or ""
    return (
        HTML_MARKER in value
        or PL_DISCLAIMER_MARKER in value
        or EN_DISCLAIMER_MARKER in value
    )


def insert_html_signature(body, signature):
    decorated = HTML_MARKER + signature
    lower = body.lower()
    positions = []

    for marker in HTML_QUOTE_MARKERS:
        pos = lower.find(marker)
        if pos >= 0:
            positions.append(pos)

    current_end = min(positions) if positions else len(body)
    if already_has_signature(body[:current_end]):
        return body, False

    if positions:
        pos = min(positions)
        return body[:pos] + decorated + body[pos:], True

    body_close = lower.rfind("</body>")
    if body_close >= 0:
        return body[:body_close] + decorated + body[body_close:], True

    return body + decorated, True


def insert_plain_signature(body, signature):
    positions = []
    for pattern in PLAIN_QUOTE_PATTERNS:
        match = pattern.search(body)
        if match:
            positions.append(match.start())

    current_end = min(positions) if positions else len(body)
    if already_has_signature(body[:current_end]):
        return body, False

    decorated = "\n\n" + signature.strip() + "\n\n"

    if positions:
        pos = min(positions)
        return body[:pos].rstrip() + decorated + body[pos:], True

    return body.rstrip() + decorated, True


def replace_text_part(part, new_text, subtype):
    charset = part.get_content_charset() or "utf-8"
    disposition = part.get("Content-Disposition")
    content_id = part.get("Content-ID")

    try:
        new_text.encode(charset)
    except (UnicodeEncodeError, LookupError):
        charset = "utf-8"
    part.set_content(new_text, subtype=subtype, charset=charset)

    if disposition:
        del part["Content-Disposition"]
        part["Content-Disposition"] = disposition
    if content_id:
        del part["Content-ID"]
        part["Content-ID"] = content_id


def body_parts(msg):
    if msg.get_content_disposition() == "attachment" or msg.get_content_type() == "message/rfc822":
        return
    if msg.is_multipart():
        for child in msg.iter_parts():
            yield from body_parts(child)
    else:
        yield msg


def apply_signature(msg, signature):
    changed = False

    if msg.is_multipart():
        for part in body_parts(msg):
            if part.is_multipart():
                continue
            if (part.get_content_disposition() or "").lower() == "attachment":
                continue

            ctype = part.get_content_type().lower()
            if ctype not in ("text/plain", "text/html"):
                continue

            try:
                body = part.get_content()
            except Exception:
                continue

            if not isinstance(body, str):
                continue

            if ctype == "text/html":
                updated, did_change = insert_html_signature(body, signature["html"])
                if did_change:
                    replace_text_part(part, updated, "html")
                    changed = True
            else:
                updated, did_change = insert_plain_signature(body, signature["text"])
                if did_change:
                    replace_text_part(part, updated, "plain")
                    changed = True
    else:
        ctype = msg.get_content_type().lower()
        if ctype in ("text/plain", "text/html"):
            body = msg.get_content()
            if isinstance(body, str):
                if ctype == "text/html":
                    updated, changed = insert_html_signature(body, signature["html"])
                    if changed:
                        replace_text_part(msg, updated, "html")
                else:
                    updated, changed = insert_plain_signature(body, signature["text"])
                    if changed:
                        replace_text_part(msg, updated, "plain")

    if changed:
        while msg.get(HEADER_MARKER):
            del msg[HEADER_MARKER]
        msg[HEADER_MARKER] = "yes"

    return changed


def reinject(mailfrom, rcpttos, payload):
    with smtplib.SMTP(REINJECT_HOST, REINJECT_PORT, timeout=30) as client:
        client.sendmail(mailfrom, rcpttos, payload)


class SubmissionSignatureServer(smtpd.SMTPServer):
    def process_message(self, peer, mailfrom, rcpttos, data, **kwargs):
        try:
            return self.handle_message(mailfrom, rcpttos, data)
        except Exception as error:
            print("Employee filter temporary failure: " + type(error).__name__, flush=True)
            return "451 4.3.0 Employee signature processing temporarily unavailable"

    def handle_message(self, mailfrom, rcpttos, data):
        msg = BytesParser(policy=policy.SMTP).parsebytes(data)

        addresses = getaddresses([str(msg.get("From", ""))])
        if len(msg.get_all("From", [])) != 1 or len(addresses) != 1:
            return "550 5.7.1 A single corporate From address is required"
        header_from = addresses[0][1].lower()
        envelope_from = str(mailfrom or "").strip().lower()

        if len(msg.get_all("From", [])) != 1 or not header_from.endswith("@" + CORPORATE_DOMAIN):
            return "550 5.7.1 A single corporate From address is required"

        if not envelope_from or envelope_from != header_from:
            return "550 5.7.1 Envelope sender must match the corporate From address"

        signatures = load_signatures()
        signature = signatures.get(header_from)
        if not signature:
            return "550 5.7.1 No employee signature is configured for this sender"

        apply_signature(msg, signature)
        reinject(mailfrom, rcpttos, msg.as_bytes(policy=policy.SMTP))
        return None


if __name__ == "__main__":
    server = SubmissionSignatureServer((LISTEN_HOST, LISTEN_PORT), None)
    print(
        "Zdrowa Polska employee submission signature filter listening on "
        f"{LISTEN_HOST}:{LISTEN_PORT}; reinject={REINJECT_HOST}:{REINJECT_PORT}"
    )
    asyncore.loop()
