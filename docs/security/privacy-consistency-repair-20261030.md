# Privacy, legal and website consistency repair — 30 October 2026

Status: review candidate on the existing feature branch. **Not deployed.** Live was verified as `speed-8884826`. No production data, sessions, encryption protocol or schema was changed for this documentation task.

## Findings before implementation

- The landing page mixed consumer benefits with algorithms, infrastructure metadata and a negative review statement. Keep detailed disclosures in the policy rather than omit them.
- Policy said both “use a recovery phrase” and “word-based recovery phrase unavailable.” Current file and optional recovery-copy code use 24 words; the full local chat archive uses a separate code. They are different files and purposes.
- September's engineering report described plaintext chat. October's experimental Signal report described missing ratchet pieces. Current chat sends use conversation-key E2EE; the experimental Signal send endpoint is quarantined (503). Neither historical report is a current certification.
- Status and reaction metadata remain server-readable. Group/private-chat content protection does not make every feature E2EE.
- Terms used an unconfirmed exclusive-court clause and a liability ceiling based on a free service. Removed those assumptions; mandatory consumer rights remain.
- Support contact depended entirely on an environment variable despite the owner having approved a public contact. Use that approved address as fallback.
- Sign-in history had no age cleanup. A separate, owner-approved 30-day implementation is staged; it must be tested and approved for release, not described as already deployed.

## Changes

| Area/files | Before → after |
| --- | --- |
| `src/app/page.tsx` | Benefits-first headline and privacy explanation, clear Get started CTA, device/privacy controls and policy link. Android remains testing access, not a public Play release. No new assets, tracking, dependencies or animations. |
| `src/app/privacy/page.tsx` | Three short commitments; accurate encrypted/readable scope; distinct backup/recovery choices; explicit reaction metadata; 24-hour Status expiry; fallback disclosure; mobile-fit service-purpose/location table without technology brand names; Settings-based controls. Named provider inventory stays in this engineering report, as the owner requested. |
| `src/app/terms/page.tsx` | Consistent recovery/account deletion; actual report handling; limited service-only content licence preserved; no invented company or exclusive jurisdiction; less aggressive liability language. |
| `src/app/support/page.tsx`, `delete-account/page.tsx` | Approved contact fallback, practical new-phone guidance, browser deletion and identity checks retained. Opening the page never deletes anything. |
| `src/app/whatsapp-alternative/page.tsx` | Consistent recovery/brand terms, no unsupported comparative security ranking. |
| `docs/security/encryption-current.md`, README and historical report banners | One current feature/path summary; old findings remain visible with dates and superseded scope. README now matches the checked R2 backend. |
| `scripts/test-public-privacy-pages.mjs` | Local packaged-browser check for six public routes, six widths, links, anchors, basic semantics and contradictory claims. |

## Public claim verification matrix

| Claim | Status / evidence |
| --- | --- |
| Private/direct/group chat text E2EE | Supported by current `ChatView → useE2EE.encrypt → crypto.ts` path and existing group/delivery tests; internal group review records actual removal/key tests. Not an independent audit. |
| Chat attachments/voice notes encrypted | Supported by random client media keys and wrapped-key path; owned document round-trip tests compare recipient decrypted downloads with originals. |
| Signal Double Ratchet universally deployed | **Not supported; do not claim.** Bridge code exists; Signal send route returns 503. Current shared-key path has different properties. |
| Status encrypted | **Not supported.** Audience-protected readable storage remains disclosed; protocol work is separate from this copy task. |
| Reactions encrypted | Corrected: emoji/sender remain metadata. |
| Hardware key storage / phrase alone restores all chats | **Not supported; do not claim.** Hosted WebView is not proof of Capacitor secure storage. Matching recovery material and existing history keys are required. |
| 30-day sign-in history | Owner-approved implementation staged separately; not live yet. Before publishing the new period, ship and verify its cleanup. |
| No advertising use of chat content | Existing stated policy retained; no advertising integration introduced. Server receives encrypted private content. This is not a claim of zero operational metadata. |
| Independent audit, published source or certification | No supporting independent/public record located. Internal reviews and tests described without upgrading their status. Repository remains private. |
| Operator | Owner-confirmed independent creator in Dubai, UAE, public email `mudassarmalak090@gmail.com`. Full legal identity/address and legal applicability need owner/counsel review. No corporation invented. |

## Recovery consistency

1. Link from an old approved device: transfer history access that device still holds; cannot reconstruct lost keys.
2. Settings → **Save my chats**: encrypted `.circlo` archive plus its matching code; includes successfully copied readable history and available media. Excludes ineligible/expired content; completion can report omissions. Save a copy away from the old phone.
3. **More ways to save:** chat-access recovery JSON plus matching 24 words, containing identity/wrapped keys, not messages/media; older code format accepted.
4. Optional recovery copy: encrypted access bundle held on server, opened locally with its matching phrase/code. Not automatic Gmail backup or a full message archive.
5. Email/password recovery: account sign-in, not missing history keys. Support cannot recover secrets it does not hold.
6. File locations depend on browser/device save controls. Downloads is usual browser default, not a guaranteed directory. Android prompts for a destination.

## Infrastructure evidence

Read-only runtime inspection on 30 October printed only backend/region classifications and configuration-presence booleans, never values or credentials.

| Provider | Evidence / disclosure |
| --- | --- |
| Bluehost | Existing Mumbai VPS runtime responding healthy; live release `speed-8884826`. |
| Neon | Runtime database endpoint region classified as Singapore, without logging endpoint/credentials. |
| Cloudflare / R2 | Active Cloudflare security configuration and `MEDIA_STORAGE_BACKEND=r2`; R2 credential presence confirmed. Network processing is not claimed to remain in one country. |
| Supabase | Still configured. Storage adapter supports legacy fallback/rollback; do not claim it has stopped handling retained objects. |
| Resend | API configuration present; email path exists. Exact processing location not independently verified, and policy says so. Presence alone is not an email-delivery test. |
| Firebase / Web Push | Firebase project/key variable names and VAPID configuration present. Browser push provider is selected by browser; Apple/Mozilla are conditional, not separately verified contracted providers. No fresh background notification test claimed here. |

## Retention/admin/deletion findings

- `deleteAccount()` records the action and deletes the owned user in one transaction; database relationships control removal of related records. Existing browser deletion navigation regression reaches the confirmation page without deleting a real account.
- Orphan media eligibility is distinct from immediate physical erasure. Recipient copies and provider backups are not erased by a UI confirmation.
- Status visibility expires at 24 hours; underlying media cleanup runs separately.
- Administrative message listing uses `requireAdmin()` and returns metadata, not decrypted content. MFA enrollment is required; sensitive mutations use additional authentication/audit helpers. **Do not claim every admin read or denied attempt is durably audited.** This copy repair does not add an unbounded logging system.
- Moderation/audit and provider-backup retention schedules are not fully established. Owner must confirm schedules; no fictional period was added.

## QA and review limits

- Relevant recovery/backup/media unit tests: 16 passed, zero failed. Full unit suite: 193 passed, zero failed.
- Isolated Linux delivery check passed with PDF, Word, Excel, CSV and a real APK: recipient downloads matched the original bytes after encryption/decryption.
- Tiny-preview regression reproduced 28px image width before the fix; corrected photo/video previews passed reserved-width, 4:3 ratio, no decode shift and full-viewer checks at 320/390/1366px.
- Disposable-database retention check passed: old associated/unregistered sign-in logs removed, recent failures/boundary rows and active sessions preserved. Session-query checks also confirmed bounded 1000-row then 5-row cleanup.
- TypeScript and targeted ESLint checks passed after correcting the retention-test fixture type.
- Production webpack build passed. Initial Turbopack invocation could not resolve parent-installed Next in this worktree; use the successful webpack build, not a claimed Turbopack pass.
- Packaged public browser check passed: `/`, `/privacy`, `/terms`, `/support`, `/delete-account`, `/whatsapp-alternative`; widths 320, 375, 390, 768, 1024 and 1440; 12 internal links; zero browser errors/overflow; heading/title/description and anchor checks. Screenshots saved under `.freebuff/performance/privacy-pages/`.
- Basic semantic/layout checks are not a complete WCAG audit. Contact links were checked as links, not by sending an email.
- No production account deletion, database edits, deployment, session reset or cryptographic migration performed for this task.

## Before approval/deployment

- Review operator legal name/address, governing-law applicability, age/consumer obligations, moderation retention and international transfer arrangements with qualified counsel. The UAE government describes privacy rights and cross-border duties; this document does not certify worldwide compliance: https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws
- Verify/ship 30-day cleanup before publishing that retention promise; do not silently run destructive production maintenance under the copy task.
- Status E2EE, native hardware storage, final Signal migration/licensing and Play Console publication remain separate work; do not label them complete because documentation is clearer.
- Obtain explicit deployment approval for this candidate, as requested. Current live pages remain unchanged.
