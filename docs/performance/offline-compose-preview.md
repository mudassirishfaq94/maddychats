# Normal offline chats and approved public entry pages

User approved the login/sign-up design, then approved the revised normal offline chat list and conversations for deployment. Android 0.9.8 (17) packages the public offline UI for native cold starts. CI and deployment must succeed before reporting this release live. No database migration or new dependency.

## Offline behavior
- Open Circlo without network: show saved conversations with search and All/Unread/Favorites/Groups/DMs filters. Open a conversation, view saved text history, switch chats, preserve drafts, and use Enter or Send normally. Queued bubbles show the no-internet explanation and a cancel action. Header and composer stay fixed while messages scroll.
- Persist conversation metadata, previews and the latest loaded history window (up to 500 messages per chat) encrypted in IndexedDB using a non-extractable device AES key. No private HTML, API response, media bytes or plaintext enter the service-worker cache. The existing encrypted draft/outbox format is reused across the online and offline views.
- Capture history already decrypted by ChatView, plus eligible received realtime messages. Fresh authenticated history replaces prior snapshots so old cleared/deleted content is not resurrected. Realtime deletes and local locks remove or hide cached content; account sign-out clears offline records and drafts. A damaged local record cannot prevent other conversations opening and produces a recovery warning.
- Never persist self-destructing/disappearing bodies, quoted content, attachment keys or decrypted media in offline history. Requests remain generic until accepted; locked rows hide identity and cannot be opened or sent to offline. Blocked conversations retain saved history with sending disabled.
- On reconnection, return to the current chat, verify the live account and current approved recipients, encrypt on-device, and send using stable client IDs. Backend expected-sender checks prevent account-switch sends. Remove queue entries only after acknowledgment. Retry runs across chats, not only the currently open chat, and never sends plaintext to providers/server.
- Browser/PWA worker uses only the public offline application assets on navigation failures/5xx. Android bundles those same assets and loads them at the canonical origin, so the existing encrypted device data is available. Native interception is limited to the static asset allowlist; TLS errors are not bypassed.

## Approved authentication pages
Temporary chat is above both forms, with a no-account-needed card. Removed autofocus so the keyboard does not conceal it on mobile. MFA/reauthentication retains its focused flow. Authentication, consent and recovery are preserved.

## Practical limits
The device must have signed in online previously. Offline history covers previously saved text, not messages never downloaded on that device. Historical pages are bounded to the latest loaded window; this cache is not an archive. Remote changes cannot be known during a total disconnection and are reconciled when connected. Attachments, calls and starting new conversations require connectivity. Self-destruct sends require connectivity. Fully closed/suspended apps cannot guarantee background retry; retry resumes on reopening. Android physical-device cold-start/airplane-mode/keyboard/reconnect checks remain unverified; a new APK is needed for its bundled fallback.

## Validation
- 119 unit tests passed, including snapshot privacy/decryption cases.
- 14 existing PostgreSQL integration tests passed in the prior verification of this work; no schema changes.
- Full local production-browser reliability workflow passed messaging, group permissions, expiration/reveal, scheduling, encrypted media, recovery, calls, communities, privacy, temporary rooms and navigation/logout isolation.
- Real two-account offline test passed saved history, normal-composer queue, cold offline list/chat navigation, Enter queue, encrypted storage, reload persistence, account mismatch rejection, recipient decryption and no duplicate sends.
- Separate 360px public-shell test passed filters, draft switching, history privacy, cleared history/preview removal, locked chats, cancellation, logout cleanup, CSP and HTTP 503 fallback.
- Controlled HTTP 403 rejection test passed: encrypted queued text survives rejection and reload; explicit retry uses the original client ID and delivers once. The rejection response is mocked, while the retry uses the real backend.
- Lint, types and production build passed. Android Kotlin/JVM checks and debug assembly passed; these are not physical-device verification.
- Full-workflow navigation small sample: normal p95 148ms; 100ms latency/4x CPU p95 1528ms on this Windows machine. The earlier 100-300ms aspiration is not guaranteed and physical performance remains unverified.
- CI offline checks are prepared but cannot run until the approved changes are committed. Screenshots use disposable fixture accounts only.
