# Signal protocol upgrade — 28 October 2026

Status: **tested protocol foundation; full migration NOT complete or deployed**.

## Verified current state

- Production chat uses `src/hooks/use-e2ee.ts` and `src/lib/crypto.ts`: conversation AES-GCM keys shared using approved devices' RSA-OAEP keys. This is not the Signal Protocol or a per-message Double Ratchet.
- The old `public/signal/` WASM exports registration, not a working message ratchet. The former Rust prototype failed compilation with 12 API errors, and its TypeScript session manager attempted to derive message keys from raw chain keys. Do not activate that manager.
- `/api/e2ee/signal/send` remains quarantined. Existing encrypted chat, media, history transfer and authentication paths are unchanged by this foundation.

## Changes and evidence

`signal-bridge/src/protocol.rs` wraps official pinned libsignal APIs for verified prekey setup and message encryption/decryption. It imports existing registration material without regenerating identity, checks registration consistency, pins the supplied approved remote identity, returns updated session/prekey state only on success, and persists PQ-prekey replay markers in the returned snapshot. Deprecated raw-chain/no-op ratchet entry points fail closed.

Native tests pass for two-way messaging across serialized restarts, delayed messages, replay, changed identities, both prekey signatures, modified ciphertext, unsupported message types and PQ-prekey replay after session loss. Browser tests exercise the generated WASM: two independently generated devices exchange 20 readable messages and reject ten replays. They also verify consumed prekeys, invalid registration rejection and raw-chain rejection. These are integration regressions, not a formal proof or independent audit.

The real browser caught two additional defects: generated protocol device numbers exceeded libsignal's 1–127 range, and Rust's native clock API cannot be used directly in this WASM target. Both paths are corrected in the new adapter. Existing experimental registrations are not silently remapped.

`src/lib/e2ee-signal-store.ts` now selects the first committed master key inside an IndexedDB transaction, authenticates new encrypted records against their account/device/namespace, rejects malformed existing material instead of treating it as absent, and waits for deletion to commit. Older unversioned records remain readable. The concurrent initialization regression fails against the prior implementation and passes after the fix. Restart, cross-address swapping and ciphertext tampering are tested in a real browser. This store remains browser storage; it is not a hardware-keystore guarantee.

New assets are separate under `public/signal/ratchet-v1/`; the existing registration assets are preserved. A capability contract prevents registration-only or incompatible assets from being accepted as a ratchet adapter. The new CI workflow rebuilds and tests the Rust and actual browser implementations without production credentials or databases.

The next storage layer provides atomic compare-and-swap for session, shared-prekey and outbox records. Concurrent connections cannot both commit the same starting revision. Encrypted revision-bound tombstones prevent stale recreation, and unversioned writers cannot overwrite or remove versioned state. Synchronous quota errors abort earlier writes in the same transaction, including the older multi-record writer. Ratchet transitions require strict transaction durability and fail closed when it is unavailable. Real-browser regressions check competing writers, stale multi-record transitions, injected second-write quota failures, mixed-account rejection, revision tampering and unsupported durability. This primitive is not yet connected to the chat send/receive pipeline; it does not by itself complete the device-wide coordinator. Strict durability follows the [documented IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction); physical power-loss recovery is not established by these browser regressions.

## Required remaining implementation, in order

1. Allocate stable official protocol device numbers transactionally. Handle collisions and upgrade existing out-of-range experimental addresses without changing identity, RSA compatibility keys or readable history. Preserve session ownership, trust and revocation checks.
2. Connect the adapter to a device-wide transaction coordinator. Serialize operations across tabs/workers; atomically commit the shared private-prekey inventory, per-peer session transition and outgoing encrypted outbox before send, or incoming archive before ACK/display. Never clone a live ratchet onto a linked phone. Test quota failures, crashes, competing tabs, logout/account switching and exact-ciphertext retries.
3. Bind authenticated encrypted payloads to conversation, sender, sender device, recipient, recipient device, message ID, operation and relevant attachment/reply context. Validate after decrypt. Reuse normal authorization, blocking, message-request, expiry and membership controls; do not enable the quarantined transport to bypass them.
4. Add explicit capability negotiation and identity approval for the new protocol. Retain legacy reads and existing cached history. Once upgraded, reject silent downgrade or implicit session replacement. Define mixed-version and revoked-device behavior before enabling sends.
5. Cover group membership changes, edits, replies, reactions, media-key distribution, disappearing messages, offline delivery, reconnect, own-device copies and bounded skipped-key handling. Keep media content encrypted once and distribute access through authenticated device sessions.
6. Integrate Android's background decryption with the same transaction/state rules. Do not send plaintext previews through FCM. Verify actual production-signed APK upgrade, foreground/background/closed-app delivery, device linking and history transfer on the phone.
7. Run two-account Web/PWA/Android acceptance, independent cryptographic review, source/licence review and rollback rehearsal before a protocol rollout. Adding Double Ratchet alone does not establish equivalence with all of Signal's current protections.

## Policy changes and legal release gates

The draft privacy and terms pages use the operator-confirmed public contact `mudassarmalak090@gmail.com` and location Dubai, UAE, describing Circlo as independently operated without inventing incorporation. They explain collection purposes, optional phone discovery, readable reactions, recovery-file versus history backup, on-device notification previews and the actual current encryption limitations.

International shipment still needs qualified legal review of the operator's legal identity and any required address/representative, applicable children's rules, provider contracts and transfer safeguards, retention/deletion schedules, consumer rights and the Play Data safety declaration. A privacy page cannot guarantee freedom from legal disputes. No independent audit or universal security/compliance claim is made.

The operator selected preparation of a source package for licence review while keeping the repository private. The official library and bridge are AGPL-3.0; the source package is a review artifact, not proof that distribution obligations have been satisfied. No repository publication, production schema migration or encryption cutover is authorized by this document.

Primary technical references: [official libsignal](https://github.com/signalapp/libsignal), [Double Ratchet specification](https://signal.org/docs/specifications/doubleratchet/). Policy review references: [UAE data protection overview](https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws), [GDPR transparency requirements](https://www.dataprotection.ie/en/individuals/know-your-rights/right-be-informed-transparency-article-13-14-gdpr), [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311).
