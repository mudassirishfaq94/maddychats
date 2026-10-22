# Mobile experience changes

Mobile navigation now has Chats, Status, Calls and Settings. Settings links to People & contacts, Communities, Starred messages, profile and Circlo Help. Desktop navigation remains available.

Circlo Help uses the maintained product guides, suggested questions and an accessible typing indicator before a 1.4-second reply. It does not send questions to an AI service. Unknown questions receive a support link. Questions exist only for the current page session; at most 20 answers are retained.

Encrypted inbox previews use explicit Decrypting message, Photo, Video, Voice message or File labels. Existing failure states retain recovery/retry actions. Chat history prioritizes visible rows, then recent messages, with bounded concurrent crypto work. Each completed text batch publishes on the next animation frame instead of waiting for 12 successes. Cache verification publishes individual ready rows independently of a slow row and warms a bounded 512-entry account-scoped memory cache. Memory hits do not wait for the disk-cache key.

Persistent history cache content remains encrypted with the device-wrapped cache key. Reads still require current server-authorized message IDs and exact ciphertext, with authenticated account/conversation/message/ciphertext binding. Deleted, self-destructing and expiring messages are excluded from the newly expanded cache path. Account teardown invalidates queued writes and reads. No plaintext history is written to browser storage.

Photo/video placeholders identify their media type. Visible video previews load and seek to an early decoded frame; they do not autoplay. Media work remains near-viewport and bounded by the existing attachment resource cache. Unsupported codecs show the download fallback. This does not introduce server-generated posters or persist decrypted media to disk; an uncached encrypted video must still download and decrypt before its frame is available.

Profile phone entry uses one editable field for country-name/code search and international number entry. Changing country preserves the parsed national number. Cancelling a country search restores the actual number. People retains its single search field; native contact numbers without an international prefix require explicit entry of their country code.

## Verification

- TypeScript, lint and existing unit checks run in CI.
- `node scripts/test-mobile-experience.mjs` exercises the real help/phone components, responsive 320/390/1280px layouts, a recorded video's decoded thumbnail, encrypted IndexedDB cache progression while one row is held, ciphertext/account isolation, and stale-write cancellation.
- Existing production browser workflows verify the four tabs, help flow and navigation through Settings. Messaging, restored workflows and history virtualization remain regression checks.
- Test screenshots are saved as CI artifacts. The isolated media test substitutes only the already decrypted URL; production attachment authorization/decryption remains covered by existing workflows.

These changes remove avoidable waits for saved messages and independently ready rows. A cold launch still requires session authorization, device key restoration and any uncached network/media work. Subsecond performance on the Poco X7 Pro must be measured on the deployed build; a universal 1ms loading guarantee would be inaccurate. This is asynchronous foreground work, not an Android operating-system background service.

Merge and deployment are left to the repository owner. Rebuild the APK only if the installed package bundles the affected frontend instead of loading the deployed site. Confirm the deployed URL/build in the installed app before device timing checks.
