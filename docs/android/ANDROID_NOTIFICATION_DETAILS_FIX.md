# Android notification details — 17 October 2026

Owner report: on the Android app every notification showed the generic *"New activity. Open Circlo to view it."* card. Toggling **Show sender and message preview** in Profile → Notifications changed nothing, and tapping the alert left the user to find the conversation by hand.

**Status: implemented in source. No APK was built, signed, uploaded or published, and no production deployment, migration, push or Firebase change was performed.** The release step below is still owned by the maintainer.

## Why the alert stayed generic

| Layer | Before | Effect on the phone |
|---|---|---|
| `nativePushPayload` (server) | Sent the raw `actorName`/`preview` fields and let each client compose its own text | The installed client decided the wording on its own |
| `MyFirebaseMessagingService` / `NativeNotificationText` (APK) | Rendered `data["actorName"]`/`data["preview"]`, with `Circlo` / `New activity. Open Circlo to view it.` as the fallback | A client that does not know those fields shows the generic card — and the setting can have no visible effect |
| Shipped build | `chat.circlo.app` 14 / 0.9.5 was signed on 16 October, before the sender/preview support existed; the version was never raised, so a rebuild could never reach a device | Every phone kept the old, text-free card |
| `notifyNewMessage` (server) | Did not know the conversation name, the group type or whether the message was readable | The alert could not be resolved consistently for groups or encrypted messages |
| Browser/in-app alert paths | Showed the sender and preview regardless of the user's own setting | The setting did not govern what the user actually saw |
| `app/chats/[id]` | Redirected a signed-out visitor to `/login?next=/app/chats` | The conversation a notification pointed at was lost on the sign-in page |

## What changed

1. **One presentation for every channel.** `src/lib/notification-presentation.ts` is the single resolver for the browser worker, the in-app alert and the Android push. It produces `title` (sender or group, branded) and `body` (preview or the encrypted/private notice) and honours `showNotificationDetails` for each recipient individually.
2. **The push carries ready-to-display text.** `notifyNewMessage` resolves the presentation where the conversation type, the conversation name, the encryption state and the recipient's own preference are all known, and `nativePushPayload` ships `title`/`body` next to the routing fields. `NativeNotificationText` renders those fields and still falls back to the legacy `actorName`/`preview` fields for older payloads.
3. **Encrypted text never travels.** The payload builder treats an unknown message as encrypted: only a message the server stored as readable text may appear as text. End-to-end encrypted messages keep the *"New encrypted message. Open Circlo to read it."* body, exactly as the browser shows it. No ciphertext, key or private text is added to the push.
4. **Every surface follows the same setting.** The live in-app alert and the foreground banner now name the sender only when *Show sender and message preview* is on, so the toggle governs what the user sees on the phone, in the browser and in the app.
5. **A tap keeps its destination.** `chatLoginDestination` carries the conversation (and the message) through the sign-in redirect, so a notification opened after a session expiry lands on the same chat instead of the chat list.
6. **The fixed build can ship.** `android/app/build.gradle` moves to versionCode **15** / **0.9.6**; `scripts/sign-android-release.ps1` and `scripts/verify-signed-android-release.py` pin the same version. Re-signing 14 / 0.9.5 was impossible: Play rejects a repeated versionCode, so the earlier release could never carry the fix.

## Release order (owner action, not performed here)

1. Deploy the server change — the resolved `title`/`body` only exist after the backend is updated.
2. Build, sign and publish **15 / 0.9.6**. Until that build is installed, the phone keeps rendering the text of the installed client; no server change can alter an APK that is already on the device.
3. Migration `0051_notification_details_preference.sql` must be applied before the account can opt in (`show_notification_details` defaults to `false`).

## What this does not claim

- Message text of an end-to-end encrypted conversation is never placed in a notification. The sender name and a *"New encrypted message"* notice are shown instead; the text is read after opening Circlo, where the keys live.
- A push that is already queued keeps the text resolved when it was sent. The browser worker re-resolves the alert at delivery time; an FCM data message cannot be rewritten after the fact.
- Android still owns the channel, importance, heads-up behaviour, sound and lock-screen privacy. Circlo can only supply eligible text.
- No physical device, APK build, Play upload, production push or migration was executed or verified by this change. Local evidence: 90 root unit tests, ESLint and TypeScript pass; the Android JVM test for the resolved alert text is written but not executed (no Android SDK here).

## Reproduce

```bash
npm run test:unit          # 90 tests, 0 fail
npm run lint
npm run typecheck
```
