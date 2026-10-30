# Circlo security

Reviewed source: the encryption-review feature branch, 30 October 2026. This describes inspected code, not an independent audit, certification or proof that every deployed client matches it. Staged changes are identified separately in the [remediation ledger](docs/security/review-remediation-20261030.md).

## 1. Architecture

The browser and hosted Android WebView encrypt current private-chat content before sending it. The server handles accounts, device approval, membership, routing, expiry and encrypted storage. Status, profiles, reactions and delivery metadata are separate from private-message encryption. HTTPS protects transport; it does not turn those separate features into end-to-end encrypted content.

## 2. Libraries and dependencies

Supported chats use the platform Web Crypto API (`src/lib/crypto.ts`), not a JavaScript implementation of AES or RSA. Recovery phrases use `@scure/bip39`; recovery envelopes use Web Crypto. Account authentication uses `jose` and password hashing uses bcrypt; neither is the message protocol. Exact resolved versions are in `package-lock.json`.

The experimental Rust bridge pins official `libsignal-protocol` revision `8fc2113bda042fc972a166a24b974b0d34155c6c` in `signal-bridge/Cargo.toml` and `Cargo.lock`. It exposes registration and serialization only. Ordinary chats do not use it. It is AGPL-licensed; keeping a repository private does not settle distribution obligations.

## 3. Algorithms and protocol

Current private chats use AES-256-GCM, random 96-bit IVs and 128-bit authentication tags. Conversation keys are wrapped to RSA-OAEP-2048/SHA-256 device keys. This composition is an application-specific protocol, not Signal's Double Ratchet. There is no deployed forward-secrecy or post-compromise-security guarantee. See `src/lib/crypto.ts:25`, `:85`, `:112`, `:130`.

## 4. Message workflow

`src/components/chats/chat-view.tsx` prepares approved devices, encrypts text/captions with `src/hooks/use-e2ee.ts`, and submits ciphertext. Recipients unwrap conversation keys locally and decrypt locally. Attachment bytes use separate random media keys wrapped through the conversation key. The message, upload, scheduled-send and edit endpoints retain session, membership, block and expiry controls. An `encrypted` flag alone is not cryptographic proof of the submitted bytes.

## 5. Key generation and exchange

Web Crypto generates device RSA and conversation AES keys using platform randomness. Only public device keys and wrapped conversation keys are exchanged (`src/app/api/e2ee/keys/route.ts`, `src/app/api/e2ee/conversation-keys/route.ts`). Fingerprint comparison and device approval remain required when indicated. The staged DM fix rotates the sending epoch after a verified peer-device change; old local keys remain available for legitimate history. Group roster changes also trigger a new epoch.

## 6. Device storage

Browser chat access uses an encrypted private-key envelope and its random wrapping factor in origin storage. Wrapped conversation keys and verification pins are also local. Since browser code can read the factor, this is not protection against same-origin script compromise. IndexedDB offline records use a non-extractable local AES key and record-bound authenticated encryption; compromised origin code can still request decryption.

`src/lib/device-key-storage.ts` has a Capacitor protected-storage path, but the shipped custom hosted WebView in `android/app/src/main/java/app/ziptalks/android/MainActivity.kt:533` does not make that path active. Do not claim Android Keystore protects the chat identity in this APK. Native session/startup protection is a separate feature, not evidence of chat-key protection. OS key storage requires a verified migration with recovery and rollback.

## 7. Backend visibility

Current supported clients send private-chat message and attachment ciphertext. Account details, memberships, timing, public device keys, profiles, status and reaction data remain service-readable. Existing historical records require separate treatment: a read-only aggregate identified older unencrypted-flag messages and legacy device-backup envelopes. Their contents were not inspected; they were not deleted or reclassified as encrypted.

Administrators' routine screens must not be confused with the access available to a database operator. The server also supplies the browser/WebView code and device directory. An actively malicious server or injected client script is outside the current confidentiality guarantee.

## 8. Integrity and authentication

AES-GCM rejects changed ciphertext under the selected key. That does **not** establish who sent it: current messages have no cryptographically authenticated sender/conversation/message context, and key shares are not signed device attestations. Sender substitution, cross-context replay and server-controlled key substitution remain open. Adding a signature without a trustworthy identity chain would not fully resolve them. See findings F1/F2/F9 in the ledger.

## 9. Backup and recovery

“Save my chats” creates an encrypted local archive with the messages/media it can copy, requiring its matching code. Chat-access recovery files and optional cloud recovery copies contain identity/key material, not full message archives. Current phrase recovery uses random 256-bit entropy; cloud envelopes bind account, device and backup identity with authenticated data (`src/lib/cloud-key-recovery.ts:14`). Email password recovery restores account access, not missing message secrets.

The staged API rejects new malformed/legacy device-backup envelopes and withholds old backup bodies. Devices retaining the original local identity can upgrade; missing identities fail closed rather than overwrite registered keys. Existing legacy rows still need a recovery-safe migration. Recovery writes roll back on partial failure (`src/lib/device-recovery-file.ts:7`).

## 10. Limitations and outstanding work

- Authenticated sender/context binding, device attestations and replay protection need a reviewed protocol migration.
- Browser/hosted-client delivery and local factors remain exposed to compromised same-origin code.
- Historical plaintext/weak-backup migration cannot be solved by relabelling records or deleting someone's only recovery copy.
- Status is access-controlled, not E2EE. Calls and notification delivery need their own coverage evidence.
- Metadata minimization and retention beyond the implemented rules remain incomplete.
- No independent cryptographic audit, universal sub-second startup, hardware-token integration or automatic Gmail backup is claimed.

## 11. Tests and evidence

Recorded staged results: 200 unit tests; TypeScript; targeted ESLint; production Linux build; actual browser device linking/recovery and DM replacement-device exclusion; two real Rust serialization/key-agreement tests. Seven active-primitive checks exercise randomness, round-trip, tampering, wrong keys and backup validation. The old unconditional-pass script was replaced. WASM API consistency is checked separately from rebuilding the binary; neither proves the message protocol secure. Full release/physical tests and outstanding findings are tracked in the ledger and [release checklist](docs/android/RELEASE_CANDIDATE_2026-10-30.md).

## 12. Report a vulnerability

Email **mudassarmalak090@gmail.com** privately with the affected version, steps, impact and a minimal demonstration using accounts you control. Do not send private conversations, credentials, recovery files or keys. Do not access another person's data, disrupt the service or publish an exploitable report before private coordination. No response deadline, bounty or completed independent review is promised here.

See the [architecture inventory and migration recommendation](docs/security/encryption-audit-20261030.md) and [Privacy Policy draft](src/app/privacy/page.tsx).
