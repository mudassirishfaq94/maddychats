# Notification and incoming-call experience

## Confirmed findings

- Valid screenshot names such as `Screenshot2_123.circlo.app.jpg` were rejected because the inner `.app` was classified as executable. The final image extension and MIME are now validated while allowing embedded `.app` and `.com` domain suffixes. Actual executable extensions, disguised executable inner extensions and mismatched MIME types remain blocked.
- Native privacy synchronization used `cancelAll()`, which also removed incoming-call alerts. Message cleanup now targets message tags; a changed lock list separately removes affected caller-identifying notifications. The incoming activity rechecks local lock state while visible.
- Calls were suppressed by the message-notification toggle, and silent notification preference prevented a full-screen call intent. Calls now use master push permission and their own Android channel; silent ringing remains silent, with full-screen eligibility left to Android and the user.
- Native call notifications and the full-screen activity hardcoded generic caller labels. Caller names are now sanitized and bounded, and hidden when conversation privacy or notification-detail preferences require it.
- Answer navigation mounted a chat and presented a small call card. Notification call destinations now use `/app/call`, with a dedicated full-screen call surface and no chat history mounted. The existing one-time local Answer grant still controls microphone consent; arbitrary URLs cannot auto-answer.
- Notification previews default to disabled in existing account settings. This change preserves that choice. Users who want sender/text previews enable **Settings → Notifications → Show sender and message preview**.
- Native resume previously cleared the account binding and stopped its call service before checking preferences/registering again. A failed request left delivery disabled locally. The new reconcile command detaches a different account but preserves the same account across failures; only confirmed opt-out or sign-out clears it. Older APKs retain the legacy path until updated. Settings now reads authenticated session registration status instead of resetting the device to “not enabled” on each mount.
- Account push preference already defaults to enabled. New native users receive an onboarding card that asks Android permission from an explicit Allow action. Acceptance registers the device; reopening does not change the account preference. An explicit refusal or account opt-out is respected. Unknown device-registration state is not rendered as disabled.

## Message presentation and security

Recipient-decrypted Android previews use `MessagingStyle` with a sender `Person` and group title where relevant. Upgrades carry a bounded display name and text over the exact-origin on-device bridge only. Remote FCM payloads never contain message plaintext. Requests, locked chats and messages without permitted decryption keep a private fallback. The browser fallback no longer says “check activity.”

Notification message IDs distinguish a new message from an update to its existing preview. An arriving FCM fallback cannot overwrite an already decrypted preview of the same message, and upgrading that notification should not ring twice. Each new message may alert according to the user's channel/sound preferences.

When the recipient decryption engine is unavailable (for example after the WebView process is terminated), a generic fallback remains necessary. This release does not introduce a native cryptographic engine, duplicate private keys into a second store, silently change existing privacy settings, or transmit plaintext through push services. No background service or extra dependency is added for preview decryption.

Call diagnostics log delivery/handoff outcomes as booleans or fixed reasons, without caller names, tokens, keys, SDP or message text. Sender identity is rechecked against device-local chat locks. Signing and app data remain unchanged.

## Validation and rollout

Regression coverage includes screenshot-domain filenames, private preview gates, service-worker Answer routing, one-time/forged Answer grants, real cold and warm WebRTC calls through the dedicated route, absence of mounted chat history, call preference isolation, caller sanitization and preservation of ringing/ongoing calls during message cleanup. Full CI and physical-device results are recorded with the release evidence; code inspection alone is not a physical pass.

The user confirmed two-way audio on the preceding deployed version after adding TURN credentials. This does not independently establish which ICE candidate was selected. New call presentation and single-Answer behavior require a Poco retest.

Deploy the web route first, then install the signed APK in place. Older APKs remain compatible with the web API. No database migration or historical encryption-data rewrite is needed. Keep the additive `/app/call` route available while APKs using it remain installed. Never uninstall or clear storage to update the test build.

Platform references: [Android call-style notifications](https://developer.android.com/develop/ui/views/notifications/call-style), [Android messaging notifications](https://developer.android.com/develop/ui/views/notifications/expanded#messagestyle), [time-sensitive/full-screen notifications](https://developer.android.com/develop/ui/views/notifications/build-notification#urgent-message).
