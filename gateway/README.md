# Universal Gmail Send As via Zdrowa Polska SMTP Gateway

This directory is a **staging implementation** for authenticated SMTP submission used by Gmail "Send mail as".

It is intentionally isolated from the existing production path.

## Existing production path preserved

The current gateway remains untouched:

- VM: `zp-signature-gateway`
- hostname: `signature-gateway.zdrowapolskagroup.pl`
- Debian 12
- static IP: `34.116.153.56`
- existing Google-to-gateway SMTP path on TCP/25 remains unchanged
- existing `/opt/zp-signature-gateway/filter.py`, `signatures.json`, and `zp-signature-gateway.service` remain unchanged
- existing TLS certificate for `signature-gateway.zdrowapolskagroup.pl` is reused
- existing outbound SES path remains unchanged

## New parallel path

Gmail external account
→ authenticated SMTP submission on `signature-gateway.zdrowapolskagroup.pl:587`
→ Postfix TLS + Dovecot SASL
→ authenticated sender/login check
→ **new** employee filter on `127.0.0.1:10027`
→ existing after-filter/outbound path
→ Amazon SES
→ recipient

Nothing on port 25 is replaced.

## Per-employee authentication

Each employee gets a unique SMTP login equal to their corporate address, e.g.

`dhyk@zdrowapolskagroup.pl`

and a unique generated password.

`smtpd_sender_login_maps` prevents that login from submitting mail with another employee's corporate envelope sender.

The same employee credentials may be configured in one or more Gmail accounts where the employee wants to use the same corporate Send As address.

## Signature source of truth

Apps Script remains the source of truth for employee signatures.

On the feature branch it exports one JSON file per enabled employee to:

`data/gateway-signatures/<slug>.json`

GitHub Pages publishes these under:

`https://zdrowa-polska.github.io/zdrowa-polska-signatures/gateway-signatures/`

The VM syncs them into one local cache:

`/opt/zp-signature-gateway/employee-signatures.json`

The new submission filter inserts the same corporate HTML/text signature only if the message does not already contain the corporate signature. On replies/forwards it inserts before common Gmail/Outlook quoted-message markers.

## Safety rules

1. Do not edit port 25 production routing while implementing this.
2. Do not replace `filter.py` or `zp-signature-gateway.service`.
3. Do not open TCP/587 until authentication, TLS, sender restrictions, and the local filter have passed local tests.
4. Start with exactly one account: `dhyk@zdrowapolskagroup.pl`.
5. Keep the current Gmail/API Send As mechanism active until SMTP submission passes web/mobile New/Reply/Forward tests.
6. Roll out other employees only after the first account succeeds.

## Deployment gate

Before any VM modification, run:

`bash gateway/scripts/preflight.sh`

and review the complete output. This script is read-only.
