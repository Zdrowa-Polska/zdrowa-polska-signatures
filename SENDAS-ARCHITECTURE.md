# Dynamic Send As architecture

## Goal

Remove the one-off hardcoded mapping between one external mailbox and one corporate address.

The Workspace custom schema `SignatureProfile` gains a multi-valued field:

`ExternalMailboxes`

For each corporate user, this field may contain zero, one or multiple external Google mailboxes.

Example:

- corporate source: `dhyk@zdrowapolskagroup.pl`
- ExternalMailboxes: `dg@vitagramma.com`

The Apps Script derives mappings dynamically:

`external mailbox -> corporate Send As address -> corporate signature profile`

No per-user mapping needs to be added to source code.

## Important Gmail API limitation

Google's Gmail API does **not** allow an ordinary user OAuth token to update a non-primary Send As alias.

For a non-primary Send As address, update/patch operations are available only to service-account clients with Domain-Wide Delegation. The `gmail.settings.sharing` scope is likewise restricted to administrative use for Google Workspace customers with Domain-Wide Delegation.

Therefore:

1. Dynamic central signature synchronization works automatically for an external mailbox only when that mailbox belongs to a Google Workspace tenant that granted the Zdrowa Polska service account the required Domain-Wide Delegation.
2. A consumer mailbox such as `wer@gmail.com` can still use `wer@zdrowapolskagroup.pl` as Gmail Send As after Gmail verification, but the signature of that non-primary alias cannot be centrally patched by the current Gmail API.
3. A universal solution for arbitrary external mailboxes requires SMTP/gateway-level signature insertion, or one-time/manual alias signature configuration in that external mailbox.

## Safe migration

The feature branch keeps the existing `dg@vitagramma.com -> dhyk@zdrowapolskagroup.pl` mapping as a temporary legacy fallback.

Migration sequence:

1. Deploy the feature branch code to Apps Script.
2. Run `migrateLegacyExtraSendAsToDirectory()`.
3. Run `dynamicSendAsStatus()`.
4. Run `testExtraSendAsAccess()`.
5. Confirm `dg@vitagramma.com -> dhyk@zdrowapolskagroup.pl` appears with source `directory` and verificationStatus `accepted`.
6. Run `syncSignatures()` and confirm `failed:0`.
7. Remove the legacy fallback from source code in the final cleanup commit.

The production signature system remains unchanged until this branch is explicitly deployed.
