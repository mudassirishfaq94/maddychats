# Current encryption coverage — 30 October 2026

This is the current source-path summary. Dated reviews describe the revision they inspected, not every later release. This document is not an independent audit or certification.

| Feature/path | Current implementation and evidence |
| --- | --- |
| Direct, group and community chat text | `ChatView` prepares approved peers, calls `useE2EE.encrypt`, and sends the supported messages API. That hook uses conversation AES-256-GCM keys; approved-device key distribution uses RSA-OAEP. This is E2EE, but does not establish Signal's Double Ratchet properties. See `src/components/chats/chat-view.tsx`, `src/hooks/use-e2ee.ts`, `src/lib/crypto.ts`. |
| Chat photos, videos, files and voice notes | Separate random AES-GCM media keys are wrapped through the conversation key; uploads contain ciphertext. Captions use the encrypted message path. Access, membership, blocks and expiry still apply. |
| Signal bridge | Rust/WASM, registration, session and mailbox code exist. `src/app/api/e2ee/signal/send/route.ts` deliberately returns 503; an environment toggle cannot enable it. Ordinary chat sending uses the supported conversation-key path. A bridge implementation is not a completed production protocol migration. |
| Status | `src/server/status.ts` stores text and media references in readable form, protected by audience/access checks and 24-hour expiry. Status is currently **not E2EE**. This statement does not describe private chats. A separate reviewed change is needed before claiming encrypted Status. |
| Reactions and routing | Reaction emoji/sender, membership, timestamps, delivery state and device public records are server-readable metadata. They are not private message ciphertext. |
| Calls | Call signaling and audio transport are separate from stored chat encryption. Do not infer a Signal calling protocol from message encryption. |
| Notifications | Device-side preview work and transport fallbacks must be described per deployed APK. Do not claim that all push paths support full native decryption merely because a bridge exists. |

## Recovery, without conflicting names

- **Save my chats:** encrypted local archive containing messages and available media successfully copied; requires its matching saved code. Completion can report unavailable files/messages. It is not a guarantee of a complete archive.
- **Additional chat-access recovery file:** encrypted device identity and retained wrapped conversation keys, protected by a 24-word phrase (older codes remain accepted). It contains no message/media archive. See `device-recovery-file.ts` and `device-recovery.tsx`.
- **Optional recovery copy:** server stores only an encrypted access bundle; its saved phrase/older code opens it locally. It is not a full chat backup. See `cloud-key-recovery.ts` and `recovery-backups.ts`.
- **Link old device:** approval plus transfer of the history keys that the old device can still access. It cannot manufacture missing keys. Revocation remains enforced.
- **Email recovery:** account access only; it cannot reconstruct lost message secrets.

The hosted Android WebView and browser store chat access information locally. Do not advertise hardware-backed storage, physical security-key support, seed-only restoration, or automatic Gmail backups without an implemented and verified path.

## How to interpret older reports

- `group-management-encryption-review-2026-10-14.md` records actual group delivery/removal tests and the shared-key design at that date.
- `audit-2026-10-22.md` records an internal application-security review with explicit scope and residual findings.
- Root `E2EE_SECURITY_AUDIT_REPORT.md` and `SECURITY_AUDIT.md` are historical notes. Their old ratings, placeholder findings and Signal terminology are not current release certifications.
- “Not E2EE” must name the feature, “ratchet missing” must name the active protocol path, and “Signal-style” must not be used as a substitute for an actual deployed protocol.

Before changing this summary, trace the caller and receiving endpoint, validate the shipped artifact/configuration, and attach test evidence. Keep historical findings rather than erasing them or silently upgrading their conclusions.
