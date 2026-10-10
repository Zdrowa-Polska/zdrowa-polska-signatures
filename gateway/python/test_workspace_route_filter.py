import unittest
from email.message import EmailMessage
from unittest.mock import patch
import test_submission_filter
import workspace_route_filter as route

class RouteAuthentication(unittest.TestCase):
    token = 'test-only-not-a-real-credential-' + 'x' * 40

    def message(self, value=None):
        msg = EmailMessage()
        msg['From'] = route.PILOT
        msg.set_content('Test body')
        if value is not None:
            msg[route.ROUTE_HEADER] = value
        return msg

    def test_missing_wrong_duplicate_credentials_rejected(self):
        for value in [None, 'wrong', 'é' * 60]:
            self.assertFalse(route.authenticate_route(self.message(value), route.PILOT, self.token))
        msg = self.message(self.token)
        msg[route.ROUTE_HEADER] = self.token
        self.assertFalse(route.authenticate_route(msg, route.PILOT, self.token))

    def test_only_pilot_sender_accepted(self):
        self.assertFalse(route.authenticate_route(self.message(self.token), 'other@zdrowapolskagroup.pl', self.token))

    def test_secret_removed_and_body_preserved(self):
        msg = self.message(self.token)
        before = msg.get_content()
        self.assertTrue(route.authenticate_route(msg, route.PILOT, self.token))
        self.assertIsNone(msg.get(route.ROUTE_HEADER))
        self.assertEqual(before, msg.get_content())

    def test_forged_from_rejected_after_route_authentication(self):
        msg = self.message(self.token)
        msg.replace_header('From', 'other@zdrowapolskagroup.pl')
        with patch.object(route, 'TOKEN_FILE') as tokenfile, patch.object(route.employee, 'reinject') as send:
            tokenfile.read_text.return_value = self.token
            server = object.__new__(route.WorkspacePilotServer)
            result = server.process_message(None, route.PILOT, [route.PILOT], msg.as_bytes())
            self.assertTrue(result.startswith('550 '))
            send.assert_not_called()

    def test_upstream_proofs_removed_before_resigning(self):
        msg = self.message(self.token)
        for header in ['DKIM-Signature', 'ARC-Seal', 'ARC-Message-Signature', 'ARC-Authentication-Results', 'Authentication-Results']:
            msg[header] = 'upstream-proof'
        signature = {route.PILOT: {'html':'Corporate signature', 'text':'Corporate signature'}}
        with patch.object(route, 'TOKEN_FILE') as tokenfile, patch.object(route.employee, 'load_signatures', return_value=signature), patch.object(route.employee, 'reinject') as send:
            tokenfile.read_text.return_value = self.token
            result = object.__new__(route.WorkspacePilotServer).process_message(None, route.PILOT, [route.PILOT], msg.as_bytes())
            self.assertIsNone(result)
            delivered = send.call_args.args[2]
            self.assertNotIn(b'upstream-proof', delivered)
            self.assertNotIn(self.token.encode(), delivered)
            self.assertIn(b'Corporate signature', delivered)

if __name__ == '__main__':
    unittest.main()
