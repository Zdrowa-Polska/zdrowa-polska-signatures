import sys
import unittest
from email.message import EmailMessage
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import polish_quote_boundary as mobile


class QuoteBoundaryTests(unittest.TestCase):
    def header(self, weekday='pt', wrap=True):
        sep = '\r\n' if wrap else ''
        return (f'{weekday}., 30 paź 2026 o 09:04 Sender <' + sep +
                'sender@example.org> napisał(a):\r\n\r\n> QUOTED CONTENT\r\n')

    def test_all_weekdays_and_wrapping(self):
        for weekday in ('pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'niedz'):
            for wrap in (False, True):
                with self.subTest(weekday=weekday, wrap=wrap):
                    body = 'KEEP CURRENT TEXT\r\n\r\n' + self.header(weekday, wrap)
                    self.assertEqual(mobile.plain_current_end(body), len('KEEP CURRENT TEXT\r\n\r\n'))

    def test_google_plain_alternative_without_angle_quote_markers(self):
        body = 'KEEP\r\n' + self.header().replace('> QUOTED CONTENT', 'UNQUOTED CONTENT')
        self.assertEqual(mobile.plain_current_end(body), len('KEEP\r\n'))

    def test_email_required(self):
        body = 'KEEP\r\n' + self.header().replace('sender@example.org', 'no-address')
        self.assertEqual(mobile.plain_current_end(body), body.index('> QUOTED'))

    def test_preserves_business_signature_like_text(self):
        body = 'KEEP employee@zdrowapolskagroup.pl in business text\r\n' + self.header()
        self.assertEqual(mobile.plain_current_end(body), len('KEEP employee@zdrowapolskagroup.pl in business text\r\n'))

    def test_patch_is_idempotent_and_rejects_unknown_code(self):
        source = mobile.LEGACY_FUNCTION + '\n\ndef another(): return 1\n'
        patched = mobile.patch_source(source)
        self.assertEqual(mobile.patch_source(patched), patched)
        self.assertIn('def another(): return 1', patched)
        compile(patched, '<patched>', 'exec')
        with self.assertRaises(ValueError):
            mobile.patch_source(source.replace('len(body)', '0'))

    def test_existing_english_boundary_wins(self):
        body = 'KEEP\nOn Thursday Sender wrote:\n> OLD\n' + self.header()
        self.assertEqual(mobile.plain_current_end(body), len('KEEP\n'))


if __name__ == '__main__':
    unittest.main()
