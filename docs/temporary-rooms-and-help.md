# Temporary rooms and built-in help

These additions require migration `0056_temporary_rooms.sql` before the matching application release. They are separate from normal accounts, messaging, encryption identities and recovery. No existing encryption data is rewritten.

## Temporary room behavior

- `/temporary` is public: no Google login, email, phone number or account is required. An existing account is not linked in the room tables. Circlo/network infrastructure can still observe operational network metadata; this is not network anonymity.
- Default lifetime is 30 minutes, chosen by the inviter (5/15/30/60 minutes). The timer begins at creation. One invitation admits one other participant. Either can end immediately; extensions require the other participant's approval within 60 seconds. Maximum total lifetime is 24 hours from creation. Transactions serialize join/send/consent/end operations and enforce expiry on every read/write.
- A 96-bit random invitation secret is generated on the inviter's device and shared privately. Only its SHA-256 lookup hash is submitted. Browser-generated ECDH P-256 keys and HKDF-SHA-256 combine the ECDH secret with the unsubmitted invitation secret and room identifier. AES-256-GCM authenticates ciphertext with the room, message UUID and sender role as associated data. Neither private key, invitation secret nor message content is submitted in plaintext.
- Separate random 256-bit participant credentials are hashed server-side and set as path-scoped HttpOnly, Secure, SameSite=Strict cookies. Private room keys live in browser session storage for refresh continuity; decrypted messages/files stay in memory. Loss of that session's key is intentionally unrecoverable. Ending/confirmed expiry clears browser key state and revokes attachment blob URLs. Authenticated server state is rechecked before history is restored or shown after returning to the tab.
- Text and encrypted downloadable attachments up to 5 MB are supported. This first version has a 20 MB encrypted room quota, 2,000-message limit and 20 simultaneously active rooms to bound resource use on the existing deployment. Calls, push alerts, reactions, search, exports and historical recovery are not supported in these account-free rooms. Normal-account upload limits/features are unchanged.
- Shared PostgreSQL LISTEN/NOTIFY sends room-change metadata only. SSE clients fetch authorized ciphertext after changes/reconnect. No per-tab database timer polls while the connection is healthy. Failure fallback reads are bounded and visible tabs only.
- End deletes the room and cascades to its encrypted messages/files. Server maintenance and the protected external cleanup job remove expired rows; access is refused immediately at the stored deadline even if cleanup has not run. A sleeping/offline host catches up after wake, so physical SQL cleanup is not promised at the exact deadline.
- Existing managed database history/WAL can retain old encrypted bytes according to provider retention; deletion is not forensic erasure. The local application backup helper explicitly excludes temporary room rows and message data. Abuse-limit counters can retain hashed operational metadata under existing rate-limit retention. Screenshots, downloads, copied keys or external copies cannot be recalled.

## Help assistant

`/help` is a maintained, local-only guide UI, explicitly labeled “Built-in help assistant · no AI service”. It searches curated guides and offers real navigation links. No inference API, API key, paid service or new dependency is used. It declines unsupported topics rather than inventing answers, never reads chat content/account state, and directs unresolved problems to Support. Login and account-menu entries expose both Help and temporary rooms.

## Rollout and rollback

Apply migration 0056, then allow the existing startup role synchronization to create exact runtime policies for the two new RLS tables. Public Data API roles receive no grants. Deploy the application only after CI and approval. Test no-account joining and expiry in two browsers and the signed Android WebView. Roll back application code first and retain the unused tables until all live rooms expire; do not restore an old production database over new user messages. A later reviewed migration may remove the empty tables. No production migration has been applied for this feature during implementation.

Tests cover invitation-secret encryption, tampering/room/sender binding, one-time joins, credential isolation, idempotent delivery, extension consent, ending/expiry, actual two-browser encryption/download/reload and local-only help. Exact execution results are recorded in the release verification report; code inspection is not physical-device verification.
