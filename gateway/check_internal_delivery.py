import sys,os,copy
from email.message import EmailMessage
from email.parser import BytesParser
from email import policy
sys.path.insert(0,os.environ.get('ZP_CODE','/opt/zp-sendas'))
import submission_filter as g,internal_signature,mobile_choice,recipient_policy
sender='fixture@zdrowapolskagroup.pl';html='<table><tr><td>Fixture Person</td><td>Email: '+sender+'</td></tr></table>';text='Fixture Person Email: '+sender
sig={'html':html,'text':text,'email':sender,'enabled':True}
g.load_signatures=lambda:{sender:sig};captured=[];g.reinject=lambda a,b,c:captured.append(c);server=object.__new__(g.SubmissionSignatureServer)
for wrapper in ('class="gmail_signature"','data-smartmail="gmail_signature"'):
 msg=EmailMessage();msg['From']=sender;msg['To']='recipient@zdrowapolskagroup.pl';msg.set_content('USER BODY\n\n'+text+'\n\nOn yesterday wrote:\n> QUOTED BODY');msg.add_alternative('<p>USER BODY</p><div '+wrapper+'>'+html+'</div><blockquote><p>QUOTED BODY</p></blockquote>',subtype='html');msg.add_attachment(b'KEEP_ATTACHMENT',maintype='application',subtype='octet-stream',filename='keep.bin')
 assert server.handle_message(sender,['recipient@zdrowapolskagroup.pl'],msg.as_bytes()) is None
 out=BytesParser(policy=policy.default).parsebytes(captured[-1]);h=out.get_body(('html',)).get_content();p=out.get_body(('plain',)).get_content();assert sender not in h and sender not in p;assert 'USER BODY' in h and 'QUOTED BODY' in h;assert list(out.iter_attachments())[0].get_payload(decode=True)==b'KEEP_ATTACHMENT'
 msg.replace_header('To','external@example.org');assert server.handle_message(sender,['external@example.org'],msg.as_bytes()) is None
 out=BytesParser(policy=policy.default).parsebytes(captured[-1]);assert sender in out.get_body(('html',)).get_content()
 print('PASS internal removal/external signature/quotes/attachment:',wrapper)
print('SYNTHETIC TESTS PASSED')
