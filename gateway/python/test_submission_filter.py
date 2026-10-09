import importlib.util
import sys
import types
import unittest
from unittest.mock import patch

# The VM uses Python 3.11; these removed modules are only needed to bind a socket.
try:
    import smtpd
except ImportError:
    sys.modules['asyncore'] = types.ModuleType('asyncore')
    sys.modules['smtpd'] = types.SimpleNamespace(SMTPServer=object)
from pathlib import Path
from email.message import EmailMessage
from email import policy
spec = importlib.util.spec_from_file_location('submission_filter', Path(__file__).with_name('submission_filter.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class SenderValidation(unittest.TestCase):
    def test_marker_cannot_bypass_sender_validation(self):
        cases = [
            ('attacker@example.org', 'attacker@example.org'),
            ('other@zdrowapolskagroup.pl', 'dhyk@zdrowapolskagroup.pl'),
            ('dhyk@zdrowapolskagroup.pl', ''),
            ('unknown@zdrowapolskagroup.pl', 'unknown@zdrowapolskagroup.pl'),
        ]
        server = object.__new__(module.SubmissionSignatureServer)
        signatures = {'dhyk@zdrowapolskagroup.pl': {'html': '<b>Signature</b>', 'text': 'Signature'}}
        with patch.object(module, 'load_signatures', return_value=signatures), patch.object(module, 'reinject') as send:
            for sender, envelope in cases:
                with self.subTest(sender=sender, envelope=envelope):
                    raw = f'From: {sender}\r\nX-ZP-Employee-Signature-Applied: yes\r\n\r\nTest'.encode()
                    result = server.process_message(None, envelope, ['recipient@example.org'], raw)
                    self.assertTrue(result.startswith('550 '))
            send.assert_not_called()

    def test_valid_sender_receives_signature_even_with_forged_marker(self):
        address = 'dhyk@zdrowapolskagroup.pl'
        signatures = {address: {'html': '<b>Signature</b>', 'text': 'Signature'}}
        raw = f'From: {address}\r\nX-ZP-Employee-Signature-Applied: yes\r\n\r\nTest'.encode()
        with patch.object(module, 'load_signatures', return_value=signatures), patch.object(module, 'reinject') as send:
            result = object.__new__(module.SubmissionSignatureServer).process_message(None, address, ['recipient@example.org'], raw)
            self.assertIsNone(result)
            self.assertIn(b'Signature', send.call_args.args[2])

    def test_reply_signature_before_quoted_signature(self):
        body = '<p>Reply</p><div class="gmail_quote">' + module.EN_DISCLAIMER_MARKER + '</div>'
        updated, changed = module.insert_html_signature(body, '<b>Signature</b>')
        self.assertTrue(changed)
        self.assertLess(updated.index(module.HTML_MARKER), updated.index('gmail_quote'))

    def test_forward_signature_before_quoted_signature(self):
        body = 'New text\n---------- Forwarded message ---------\n' + module.EN_DISCLAIMER_MARKER
        updated, changed = module.insert_plain_signature(body, 'Signature')
        self.assertTrue(changed)
        self.assertLess(updated.index('Signature'), updated.index('Forwarded message'))

    def test_existing_current_signature_is_not_duplicated(self):
        body = '<p>Text</p>' + module.HTML_MARKER + '<b>Signature</b>'
        self.assertEqual((body, False), module.insert_html_signature(body, '<b>Signature</b>'))

    def test_attachments_preserved(self):
        msg = EmailMessage()
        msg.set_content('Hello')
        msg.add_alternative('<p>Hello</p>', subtype='html')
        msg.add_attachment(b'binary\x00attachment', maintype='application', subtype='octet-stream', filename='test.bin')
        nested = EmailMessage()
        nested.set_content('Original attached email')
        msg.add_attachment(nested, filename='original.eml')
        before = [x.as_bytes(policy=policy.SMTP) for x in msg.iter_attachments()]
        self.assertTrue(module.apply_signature(msg, {'html':'<b>Signature</b>', 'text':'Signature'}))
        self.assertEqual(before, [x.as_bytes(policy=policy.SMTP) for x in msg.iter_attachments()])

    def test_polish_signature_on_ascii_body(self):
        msg = EmailMessage()
        msg.set_content('Hello', charset='ascii')
        self.assertTrue(module.apply_signature(msg, {'html':'Zażółć', 'text':'Zażółć'}))
        self.assertIn('Zażółć', msg.get_content())

    def test_multiple_from_addresses_rejected(self):
        address = 'dhyk@zdrowapolskagroup.pl'
        raw = f'From: {address}, other@zdrowapolskagroup.pl\r\n\r\nTest'.encode()
        with patch.object(module, 'reinject') as send:
            result = object.__new__(module.SubmissionSignatureServer).process_message(None, address, ['recipient@example.org'], raw)
            self.assertTrue(result.startswith('550 '))
            send.assert_not_called()

    def test_cache_failure_is_retryable(self):
        address = 'dhyk@zdrowapolskagroup.pl'
        raw = f'From: {address}\r\n\r\nTest'.encode()
        with patch.object(module, 'load_signatures', side_effect=OSError()), patch.object(module, 'reinject') as send:
            result = object.__new__(module.SubmissionSignatureServer).process_message(None, address, ['recipient@example.org'], raw)
            self.assertTrue(result.startswith('451 '))
            send.assert_not_called()

if __name__ == '__main__':
    unittest.main()
