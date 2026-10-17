# Recipient-device notification previews

The original generic message was intentional: the server cannot decrypt E2EE messages. SSE copied the server preview, the service worker rendered delivery metadata, and Android rendered FCM fields. None asked the running recipient for decrypted text. Grouped PWA notifications also replaced the latest body with an encrypted-message count.

## Delivery behavior

- FCM and Web Push keep the existing delivery, authorization, routing and deduplication paths. Message plaintext and encryption keys never go to either provider. FCM message titles/bodies and actor fields are always private fallbacks.
- The authenticated no-store delivery lookup checks current account, membership, blocks, mute/archive, deletion/expiry and preferences. It returns encrypted text only to an authorized recipient with previews enabled, and never for a pending request.
- A running browser/PWA answers a worker MessageChannel request using the existing recipient-side decrypt function. The worker allows 800 ms for a runnable client and otherwise shows a private fallback. This affects only alert presentation, never message transport. Plaintext is not cached in worker storage or notification data.
- Android first displays the private FCM alert. It posts an event to an existing exact-origin WebView, which may decrypt and replace that same conversation card through the exact-origin bridge. No WebView is started to obtain keys, and no background key service is added. SSE can also trigger a local alert.
- Normal local previews show sender + text; groups show group name + sender/text. Requests show `New Message Request` / `You have received a new message request.` without decryption. Locked chats override both with `Circlo` / `New message received.`.
- Without a runnable recipient, normal messages remain private. Request wording is available with previously synchronized device lock state; missing or corrupt lock state falls back to the generic alert too.
- Foreground OS notifications remain suppressed; the existing in-app banner uses the same recipient-side policy.

## Lock integration

This checkout has no existing Lock Chat feature. Its future UI must call `setNotificationLockedChats(ids)` from `src/lib/local-notification-preview.ts` when lock state changes. This writes the JSON array to `maddy:locked-chats` and emits the same-window privacy event. Other tabs use the storage event. A caller that writes localStorage directly must also dispatch `maddy:locked-chats` in that window.

Privacy changes invalidate in-flight previews and dismiss active OS cards and in-app banners. Only lock IDs are synchronized into account-keyed worker IndexedDB and native SharedPreferences; message content and keys are never stored there. Unlocking permits previews for subsequent messages without replaying old plaintext. Unsupported/older Android bridges continue to receive private FCM fallbacks; the new native bridge requires a rebuilt APK.

## Platform limits and release verification

Background WebViews and browser pages may be frozen or terminated. Decryption then remains unavailable and alerts are generic. Circlo cannot erase notification history retained by the OS, screenshots, or content already observed before a lock. Dismissing active notifications cannot provide that guarantee. Calls retain their existing separate behavior.

Before release, use two accounts on real Android and PWA devices. Enable notification details, then verify normal DM, group text, pending request, accepted request, locked/unlocked conversation, missing device key, details disabled, account switch, offline delivery and rapid lock during decryption. Repeat visible, hidden/minimized and fully closed. Check that locking removes active cards, notification taps retain their message destination, and delivery remains available without a local preview.

## Verification on 2026-10-18

Dependency installation succeeded using a cache on D: because C: is full. Full ESLint and TypeScript checks passed. The unit suite passed all 94 tests when run sequentially with TEMP/TMP on D:. Three JVM tests compiled the real Kotlin NativeMessagePrivacy class and verified normal/request/locked fallback behavior. Worker tests exercise recipient previews, latest-message grouping, request wording with persisted lock state, and lock changes during an in-flight preview.

Real-device testing is pending: ADB lists no connected devices. A full Android APK build is also pending a matching Firebase client config: the available local google-services.json names app.ziptalks.android, while this branch builds chat.circlo.app. No mismatched Firebase config was copied and no delivery credentials were changed.
