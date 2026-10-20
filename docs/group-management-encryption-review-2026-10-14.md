# Group management and encryption review — 14 October 2026

## Release source mismatch

Codebuff's `edd7145` (name/description) and `187b56c` (photo UI) were present on the local `main` branch, but not on any fetched remote branch or GitHub's deployed `origin/main` (`090b0d2` at inspection). They had not reached the deployment source. This release cherry-picks those two focused changes without overwriting the root checkout's unrelated uncommitted work.

## Group editing

Owners and admins open a chat → Chat options → Group info → Group settings. Name, description, rules, announcements, admin-only messaging and slow mode save together with an explicit Save button. Photo changes upload immediately. Successful writes return server-normalized values; failures retain the draft and show a retryable error. The panel scrolls on mobile; controls have at least 44px targets. Realtime events refresh the summary, sidebar and other open details panels.

The server validates group existence/type, current membership, administrative role, same-origin requests and bounded strictly typed input. It rejects empty names, objects in text fields, string booleans and invalid slow modes. Settings and invite creation/redemption have shared Postgres rate limits. Photo processing retains the existing upload budget, size bounds, real image decoding/reconstruction and storage checks. No new database schema or paid service is required.

## What actually encrypts group messages

The production chat composer calls `useE2EE` in `src/hooks/use-e2ee.ts`, backed by `src/lib/crypto.ts`. Having Signal/X3DH/Sender Keys modules elsewhere in the repository does **not** mean this group path uses the Signal protocol.

1. Each browser creates an RSA-OAEP 2048-bit/SHA-256 device keypair. Private-key backups use AES-GCM with a PBKDF2-SHA-256 key derived from a separate browser-held recovery secret. Account sign-in alone is not approval of a replacement encryption device.
2. The client discovers current conversation members and their approved device public keys. Device-set changes are pinned locally and require the existing explicit safety verification/approval step before sharing to changed peers.
3. A random AES-256-GCM conversation sending key encrypts text before upload, with a fresh random 96-bit IV per encryption. RSA-OAEP wraps that key separately for each authorized recipient device, including the sender's recovery copy. The server stores ciphertext/wrapped keys, not the AES key in plaintext.
4. The first bootstrap is serialized in Postgres. Sharing archives a predecessor wrapped key before replacing its active copy; recipients can recover older history with their private key.
5. Chat attachments use separate random media keys, whose keys are encrypted using the conversation key. The media upload stores encrypted bytes. This is distinct from non-E2EE group/profile photos and status posts.

## Findings and changes

| Finding | Fix |
| --- | --- |
| Removed members could retain an AES key while remaining browsers continued using that same sending key. API removal alone cannot erase retained keys. | Group preparation now binds its local sending baseline to the exact membership-row identities and approved device set. A changed roster/device set, a leave/rejoin, or an absent/legacy baseline generates a fresh sending key and shares it only to current approved recipients before enabling sending. Prior keys remain for historical decryption. Unchanged preparation avoids repeated RSA fan-out. |
| Removing the final other participant produced an empty pending trust signature, which the approval helper treated as “nothing pending.” | Pending-map presence, rather than truthiness of the signature, determines whether a detected change can be approved. A remaining owner can continue securely. |
| The change-approval banner asked users to verify a safety number without showing the actual replacement device fingerprints. A conversation-key number alone does not identify that new device. | Added a mobile review dialog with each current participant's device ID and SHA-256 fingerprint in exactly the format shown in their Profile. Approval is disabled until explicit confirmation, applies only to the reviewed device set, and leaves messages queued on cancellation. An empty group baseline is retained, while a sender-only first-contact DM still pins the recipient's first actual device when it arrives. |
| Group-settings failures were swallowed and arbitrary inputs were coerced to strings/booleans. | Explicit save/retry feedback, strict validation, group-type/role checks, bounded requests, metadata-only audit records and realtime updates. |
| Concurrent invite redemptions could both pass the final-use check. | Redemption locks the invite row and checks expiry, group availability and remaining uses inside one transaction; only a successful membership insertion consumes a use. |
| Visiting a GET invite URL automatically joined the account. | GET is now a confirmation page; a same-origin, authenticated, rate-limited POST joins explicitly. Deleted groups cannot be joined with old links. New invite codes contain 128 random bits; existing 12-character links remain compatible. Revocation is scoped to the supplied group and creator. |
| Encryption details claimed automatic periodic rotation “for forward secrecy.” | Replaced with the actual retained-history and group-change rotation behavior. Retaining old decryptable keys is not Signal-style per-message forward secrecy. Corrected an outdated X25519 comment to RSA-OAEP. |

## Security boundaries and limitations

- Removal cannot retract content or keys a participant already received, copied or screenshotted. An in-flight send prepared before a simultaneous removal is not a cryptographic revocation of already shared material. The refreshed browser client checks the roster before sending; an already-open older release must reload to adopt this fix.
- This is a shared-key browser E2EE design, not an independently audited Signal group protocol. It has no per-message ratchet, key transparency, cryptographic group-membership consensus or cryptographic sender signatures. The authenticated server enforces sender identity and membership; a malicious server or compromised group participant is outside stronger guarantees such as authenticated group messaging consensus. These properties need a dedicated protocol migration and independent review, not a claim that this release has supplied them.
- First-use public-key discovery trusts the server; later changes are locally pinned. Users must compare verification details through a separate trusted channel. Device/browser compromise or XSS that executes inside the app can access decrypted content; browser storage deletion can remove recovery material.
- Group names, descriptions, rules, announcements, membership, timestamps and group photos are service-visible metadata. The UI now states this distinction. This review does not certify metadata anonymity or all application features as E2EE.
- A newly admitted member receives the new sending epoch, not an automatic history-key grant from the updated preparation path. Previously authorized members may already possess old history keys. Device recovery intentionally restores the same account's retained history.

## Verification

Local checks completed:

| Check | Result |
| --- | --- |
| Production build, TypeScript, lint and whitespace checks | Passed |
| Unit tests | 52 passed |
| Production HTTP authorization suite | Passed, including strict settings rejection, owner persistence, nonmember/member denial, no GET enrollment, exactly one winner for simultaneous one-use invite redemption, cross-site rejection and deleted-group rejection |
| Actual 320px browser group settings | Passed: edit name/description, save, reload and inspect persisted values, upload photo, inject a failed save and successfully retry |
| Actual group encrypted delivery | Passed: recipient displays the pre-removal message; stored text is ciphertext |
| Removal with retained keys | Passed: unwrap the former member's actual keys, prove they decrypt the baseline, then prove none decrypt the post-removal message; removed member's key API returns 404 |
| Sole-member approval and rejoin | Passed: owner reviews and approves the empty peer set; peer explicitly joins from the invite page; the fingerprint displayed on review matches the actual public key before approval and encrypted delivery. Approval remains disabled without confirmation. |
| Emergency device recovery with fingerprint review | Passed: proof of private-key possession, fresh sign-in, MFA, cross-account and replay rejection, old-session revocation, preserved history, explicit matching-fingerprint review and encrypted messages in both directions; zero browser errors/mobile overflow |
| First-contact DM compatibility | Passed the browser introduction/notification, offline sender recovery, recipient approval/reply and encrypted outbox suite; empty group trust does not prevent a recipient's initial DM device enrollment |
| Mobile main pages and private-community checks | Passed, with zero browser JavaScript errors in the targeted group workflow |
| Dependency gate and full-history secret scan | Passed; dependency gate retains the previously documented development-only advisory exceptions, not a claim of zero advisories |

All local fixtures use disposable accounts and loopback Postgres; third-party OAuth responses and push delivery are mocked in the existing suites. GitHub CI runs the complete regression workflow before Render's checks-pass auto-deployment. Live checks must verify the deployed commit before testing owned temporary accounts. No production stress test or real-user message inspection is performed. Uploaded live QA objects, if any, remain tracked for the normal orphan-retention cleanup after their owning fixtures are removed.
