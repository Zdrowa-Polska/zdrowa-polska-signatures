"""Remove a verified sender signature outside quoted HTML, including after quotes."""
import re
import mobile_choice as mobile

class OwnSpans(mobile.SignatureSpans):
    def handle_endtag(self, tag):
        if tag in mobile.VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            if any(x[2] for x in self.stack):
                raise mobile.UnsafeSignature('Malformed signature markup')
            return
        _, start, signature, protected = self.stack.pop()
        if signature and not protected:
            self.spans.append((start, self.source.find('>', self.source_position()) + 1))

def clean_parts(html_body, plain_body, signature):
    parser = OwnSpans(html_body)
    parser.feed(html_body); parser.close()
    if any(x[2] and not x[3] for x in parser.stack):
        raise mobile.UnsafeSignature('Unclosed signature markup')
    spans = [(a,b) for a,b in parser.spans if not any(c<=a and b<=d and (a,b)!=(c,d) for c,d in parser.spans)]
    emails = re.findall(r'[\w.+-]+@zdrowapolskagroup\.pl', signature['text'], re.I)
    plain_spans=[]
    tokens=mobile.plain_tokens(plain_body)
    values=[m[0] for m in tokens]
    for a,b in spans:
        fragment=html_body[a:b]
        text=mobile.visible_text(fragment).strip()
        if not text:
            continue
        if not emails or not any(e.lower() in fragment.lower() for e in emails):
            raise mobile.UnsafeSignature('Unrecognised client signature')
        target=[m[0] for m in mobile.plain_tokens(text)]
        hits=[i for i in range(len(values)-len(target)+1) if values[i:i+len(target)]==target] if target else []
        if len(hits)!=1:
            raise mobile.UnsafeSignature('Cannot safely locate the plain signature')
        i=hits[0];start=tokens[i].start();stop=tokens[i+len(target)-1].end()
        # Only a complete, unquoted signature block may be removed.
        line=plain_body.rfind('\n',0,start)+1
        if plain_body[line:start].strip() and not re.fullmatch(r'(?:\s|\[image:[^\]]*\])*',plain_body[line:start],re.I):
            raise mobile.UnsafeSignature('Signature shares a content line')
        prefix=plain_body[:start]
        prefix=re.sub(r'(?:[ \t]*\[image:[^\]]*\][ \t]*)+(?:\r?\n[ \t]*)*\Z','',prefix,flags=re.I)
        start=len(prefix)
        before=plain_body[:start]
        sep=re.search(r'(?m)^--[ \t]*(?:\r?\n)[ \t\r\n]*\Z',before)
        if sep:start=sep.start()
        plain_spans.append((start,stop))
    for a,b in sorted(plain_spans,reverse=True):
        plain_body=plain_body[:a]+plain_body[b:]
    for a,b in sorted(spans,reverse=True):
        html_body=html_body[:a]+html_body[b:]
    return html_body,plain_body

def remove(msg,signature,replace_text_part):
    if any(p.get_content_type() in ('multipart/signed','multipart/encrypted','application/pkcs7-mime') for p in msg.walk()):
        raise mobile.UnsafeSignature('Cannot modify cryptographically protected message')
    parts=[(p,p.get_content()) for p in mobile.body_parts(msg)]
    html=[(p,b) for p,b in parts if isinstance(b,str) and p.get_content_subtype()=='html']
    plain=[(p,b) for p,b in parts if isinstance(b,str) and p.get_content_subtype()=='plain']
    if len(html)!=1 or len(plain)!=1:
        raise mobile.UnsafeSignature('Ambiguous MIME alternatives')
    hp,h=html[0];pp,p=plain[0]
    h,p=clean_parts(h,p,signature)
    replace_text_part(hp,h,'html');replace_text_part(pp,p,'plain')
