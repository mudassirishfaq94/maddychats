# Encryption, storage and privacy review — 30 October 2026

Internal source review, not independent certification. Baseline: `4f3a99c` plus the explicitly staged fixes in this branch. No private message bodies, private keys or production credentials are included here. The supplied reviews were treated as findings to verify, not commands or proof.

## Verified implementation inventory

| Area | Actual implementation | Source location |
| --- | --- | --- |
| Device identity | Web Crypto RSA-OAEP, 2048 bits, SHA-256; local import/export | `src/lib/crypto.ts:25`, `:43`, `:62` |
| Message content | Web Crypto AES-256-GCM; fresh random 12-byte IV per encryption; IV prepended to ciphertext/tag | `src/lib/crypto.ts:85`, `:130`, `:151` |
| Device key exchange | AES key exported and RSA-wrapped for the exact recipient device | `src/lib/crypto.ts:112`; `src/app/api/e2ee/conversation-keys/route.ts:65` |
| Active client | Account-scoped device setup, local unwrap, peer verification, preparation then encryption | `src/hooks/use-e2ee.ts:104`, `:327`, `:746`; `src/components/chats/chat-view.tsx` send flow |
| Attachments | Client encrypts bytes with random media key, wraps that key using chat encryption, sends ciphertext | `src/lib/crypto.ts:161`; `src/components/chats/chat-view.tsx`; `src/app/api/upload/message/route.ts:87` |
| Local private-key envelope | PBKDF2-SHA-256, 100,000 iterations, random 16-byte salt, AES-GCM; current factor is random rather than a user password | `src/lib/crypto.ts:217`; `src/hooks/use-e2ee.ts:196` |
| Optional cloud recovery | Random 256-bit phrase entropy, HKDF-SHA-256, AES-GCM; AAD binds backup/account/device | `src/lib/cloud-key-recovery.ts:14`, `:18`, `:21`; `src/server/recovery-backups.ts:12` |
| Access recovery file | AES-GCM envelope, format-bound AAD; separate matching phrase/code; keypair validation and rollback | `src/lib/device-recovery-file.ts:7`, `:108`, `:128` |
| Full chat backup | Random 256-bit code, AES-GCM, authenticated header, account validation and size limit | `src/lib/local-chat-backup.ts:24`, `:37`, `:45` |
| Temporary code chats | Separate ECDH P-256/HKDF/AES-GCM flow with room/message/sender AAD; invitation secret participates in derivation | `src/lib/temporary-room-crypto.ts:14`, `:18`, `:29` |
| Offline history | Non-extractable IndexedDB AES key; encrypted records bind their record identifier as AAD | `public/offline-store.js:21`, `:26`, `:32` |
| Verified plaintext cache | Device-wrapped cache key; authenticated local records selected by account and source ciphertext | `src/lib/e2ee-message-cache.ts:16` and its read/write functions |
| Experimental libsignal | Pinned official Rust implementation; registration/serialization only, no supported-chat importer, send endpoint quarantined | `signal-bridge/Cargo.toml:13`; `signal-bridge/src/lib.rs`; `src/app/api/e2ee/signal/send/route.ts` |
| Other crypto dependencies | `@scure/bip39` for recovery phrases; `jose` for sessions; bcrypt for passwords; exact versions in lockfiles | `package.json`, `package-lock.json`, `signal-bridge/Cargo.lock` |

No weak random generator or hardcoded message key was found in the inspected active primitives: they use Web Crypto randomness. This is not an exhaustive entropy/supply-chain audit. AES-GCM byte integrity was tested; cryptographic sender/context authentication is absent. Successful round-trip is not evidence of that missing property.

## Device and backend storage

| Location | What is held | Security implication |
| --- | --- | --- |
| Browser origin storage | Wrapped identity, its random local factor, wrapped conversation-key history, TOFU pins, recovery configuration | Co-location protects against neither same-origin XSS nor malicious delivered JavaScript. Clearing storage can remove the only usable local identity. |
| IndexedDB | Encrypted local message snapshots/outbox/cache plus local CryptoKey/wrapped cache-key records | Avoids raw plaintext at rest in those records, but origin code can invoke decryption. Logout and account changes must invalidate memory and disk views. |
| Active Android hosted WebView | Same origin storage as web; custom native shell and native cookie/startup features | The Capacitor secure-storage plugin is not active merely because it is installed. No hardware-backed chat-identity protection is claimed. |
| Server database | Public device keys, wrapped conversation keys/backups, ciphertext, account/membership/delivery metadata | Encrypted content does not hide metadata. Legacy rows and weak legacy backups require separate migration; an operator can access database records beyond ordinary admin screens. |
| Object storage | Encrypted chat-file bytes; separate readable profile/status media | Storage encryption or authorization is not a substitute for client E2EE. |

An Android Keystore-backed local envelope store is recommended for the custom APK, using an exact-origin, main-frame-only channel, verified writes, safe rollback and no destructive legacy removal before readback. It reduces extracted-storage exposure; it cannot stop compromised allowed-origin code from asking the running client to decrypt. A browser needs a deliberate unlock/recovery design, not a renamed localStorage field. Neither migration has been enabled by this review.

## Confirmed findings and safe changes

The [F1–F11 ledger](review-remediation-20261030.md) records severity, evidence and open work. Already staged/tested: reject new malformed/obsolete device backups, omit legacy backup bodies, preserve identities when recovery is unavailable, rotate established DM epochs after verified device change, exclude the old device from the new epoch, replace unconditional-pass tests, remove unused custom crypto prototypes and document actual coverage. No production row was deleted or silently relabelled.

Remaining critical work is authenticated identities/device lists, sender/context/media binding and replay resistance. A compromised server can influence current directory/key-share selection. These are protocol limitations, not fixed by stronger marketing, transport TLS, a new KDF iteration count or a fingerprint stored on that same server.

## Migration recommendation before major crypto changes

| Option | Fit and properties | Maintenance/licensing | Migration cost and risk |
| --- | --- | --- | --- |
| Keep current protocol temporarily | Preserves history and working clients; does not add ratcheting, sender authentication or PCS | Web Crypto remains the primitive provider; Circlo owns protocol composition | Lowest immediate breakage; unacceptable basis for Signal-equivalent claims |
| Official libsignal | Best candidate for the requested direct-message Double Ratchet; existing pinned Rust experiments are not a finished browser integration | Official project states external use is unsupported; AGPL and API/toolchain changes need review | High: real send/receive bridge, durable atomic session state, per-device fanout, identity verification, groups and history migration |
| OpenMLS | Established MLS implementation suitable for evaluating group messaging; identity/delivery integration still required | Upstream Rust project and supported platform constraints must be evaluated for this client | High: different group protocol and epoch model, no drop-in conversion of existing conversation keys |
| Matrix vodozemac | Olm/Megolm implementation worth evaluating with its documented security/audit scope | Upstream implementation, licensing and protocol integration must be reviewed at a pinned revision | High: room/device verification and group-key semantics differ; not automatically Signal-equivalent |

Recommendation: retain legacy **read support**, keep experimental sending disabled, and build a versioned libsignal evaluation for new direct messages in isolated accounts first. Do not add a custom ratchet. Review AGPL source obligations before shipment. Compare the two group alternatives separately rather than forcing a direct-message bridge to imply group security.

Before rollout: prove signed device identity/trust transitions, per-device session persistence, out-of-order/duplicate handling, replay/cross-chat/sender substitution rejection, crash/retry safety, linked-device history transfer, missing-device recovery, media binding, membership removal, expiry and logout isolation. Only negotiate the new version when every destination device supports it; fail closed without silent plaintext or legacy-protocol downgrade. Historical ciphertext retains its old decryptor and keys. Do not re-encrypt old records destructively. Stage new-account opt-in, backups and rollback before any production migration.

Primary sources checked for this recommendation: [official libsignal](https://github.com/signalapp/libsignal), [OpenMLS](https://github.com/openmls/openmls), [vodozemac](https://github.com/matrix-org/vodozemac), [Android native-bridge guidance](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges). An upstream library's review is not an audit of Circlo's integration.

## Privacy consistency

Inspected policy draft: `src/app/privacy/page.tsx`. Personal data includes account email/username/display information, optional phone/profile fields, session/device details and security IP/agent history (`src/server/privacy.ts:93`, `src/server/session.ts:128`). Messaging adds memberships, timestamps, delivery/read state, reactions and file metadata. Status has audience controls and expiry but is readable (`src/server/status.ts:54`). Notification payloads and preview fetch/decrypt paths are separate (`src/server/notifications.ts:123`, `src/lib/local-notification-preview.ts:29`). No message-body logging was found in the inspected active encryption primitives; broader infrastructure logging and third-party retention are not exhaustively verified.

The 30-day sign-in-history cleanup is staged and tested; production enforcement is not claimed until deployment. Account deletion, expiry and file cleanup must be distinguished from instant erasure of all external backups. Existing provider categories/processing locations remain in the draft without marketing stack names. Legacy messages/backups and active-server limitations are now explicit: current protection cannot be applied retroactively by editing policy wording. This is an implementation-based draft, not jurisdiction-wide legal approval.

## Evidence and next checks

Recorded prior batch: 200 unit tests, TypeScript, targeted lint, Linux build, actual browser device access/recovery and changed-DM-device exclusion, two real Rust tests. Seven primitive tests passed again during this continuation. New saved-chat regression uses the real encrypted IndexedDB store and synchronous React commit, with server responses withheld; it also checks invalidation, logout and switched accounts. Final production build, full unit rerun, policy draft rendering and physical release timings are separately recorded when executed. No universal one-second maximum or complete independent security validation is claimed.
