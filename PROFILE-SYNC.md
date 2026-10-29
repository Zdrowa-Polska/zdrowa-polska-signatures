# Google Workspace profile synchronization

Google Workspace Directory is the only editable source for the fields already shown in employee signatures and public business cards: name, job title, work phone, primary email, LinkedIn, profile photo, and EmailSignature. Private Directory fields are not exported.

## Data flow

`UnifiedProfileSync.gs` runs every five minutes in the existing Apps Script project. It reads the complete Directory, renders profiles using the existing renderer, updates Gmail using the existing sync, and publishes one complete `data/unified-profiles.json` document only after all profiles render successfully. It reuses the existing renderer and Gmail/GitHub permissions. The separately approved admin.directory.group.member scope maintains only signature-profile-sync@zdrowapolskagroup.pl, a restricted technical group with posting disabled. Script Properties retain the immutable identity and historical URL reservations; public IDs are SHA-256 hashes of Google user IDs.

GitHub Pages builds cards and vCards from this document. Historical slugs point to current profile data, so an existing Home Screen bookmark survives a primary-email rename. Pages refresh when opened or brought to the foreground. A downloaded vCard in somebody else's Contacts app and an already delivered email are independent copies, not live subscriptions.

The server polls the fixed repository URL every two minutes. It validates the whole document, retains the last good cache on failure, and atomically replaces its runtime file. SMTP logins stay bound to the same immutable employee identity; a renamed address can use the existing credential. This worker never reads or changes passwords. A new employee without SMTP credentials can use their corporate Gmail; external Send As credential enrollment is a separate one-time action.

A false EmailSignature removes cards and outgoing signatures while preserving mail. A suspended or deleted enrolled user is removed from the employee sender maps. Deleted identities publish anonymous tombstones. Retired card URLs are never silently assigned to a new employee.

## Rollout sequence

1. Run `node --test tests/*.test.mjs`, `python3 -m unittest discover -s tests -p 'test_*.py'`, and the offline regression against the current server filter.
2. Deploy the Pages code before the first unified document is published. Without that document, the legacy build remains supported.
3. Add `apps-script/UnifiedProfileSync.gs` to the existing production project without replacing the current renderer.
4. Run `syncUnifiedProfiles` manually. Verify Directory counts, publication, Gmail execution logs, and the Pages deployment.
5. Stage gateway files; run `python3 gateway/install.py --check-only` against the live code. Installer takes a root-only backup before the additive integration and leaves its timer dormant.
6. Run server `profile_sync.py --dry-run`, review immutable identity/SMTP bindings, then activate it and enable `zp-profile-sync.timer`.
7. Change only rule 10f0f (Signature Gateway - pracownicy): keep outgoing/internal outgoing, active user accounts, TLS, proof header and route unchanged; replace its static sender regex with Group membership of signature-profile-sync@zdrowapolskagroup.pl. The group contains exactly active Directory users with EmailSignature=true. Do not broaden routing to the entire domain. The clinic rule and delegated Test Skoki flow remain separate. The authenticated Workspace port temporarily defers unknown renamed senders until the next complete snapshot; inactive known senders are explicitly rejected.
8. Run `enableUnifiedProfileSync`, which completes a sync before replacing the old hourly schedule. Check `unifiedProfileSyncStatus` and the server journal/timer.

## Operational checks

Apps Script: `unifiedProfileSyncStatus()` reports last success, last publication, last error, and trigger count. Google trigger failures remain visible in Executions. Server: `systemctl status zp-profile-sync.timer` and `journalctl -u zp-profile-sync.service`. Public mobile card profile revision must match the deployed manifest, and each legacy slug must render the current primary address.

## Rollback

Disable the new server timer, restore the installer backup of the two filters and Postfix maps, restore prior sender allowlists, and restart the two filter services. Do not erase Google history properties or historical URL reservations. Restore the old hourly Apps Script trigger if the new schedule is disabled. Roll back Pages code and remove the unified document together if reverting the publication architecture.
