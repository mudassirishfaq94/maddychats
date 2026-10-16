# Chrome-installed PWA notification verification — 17 October 2026

Scope: browser/PWA only. No production, Firebase, authentication, Android package or signing changes.

## Findings

- The manifest requests standalone installation. Chrome Android can install a WebAPK or a home-screen shortcut depending on browser/device support. The user confirms tapping a notification opens the installed Circlo PWA. This does not establish the wrapper, package name, channel owner or channel importance. These remain NOT VERIFIED on the physical phone.
- Browser delivery uses VAPID Web Push, metadata-only payloads, high transport urgency, the root service worker and an authenticated no-store presentation lookup. Native FCM/channel code does not configure Chrome notifications.
- Android/Chrome own the channel, importance, sound, heads-up settings, Do Not Disturb and interruption suppression. The website cannot inspect or enable the General pop-up switch, set IMPORTANCE_HIGH, choose an Android channel ID, or safely open a specific channel via a standard browser API. Transport urgency does not set channel importance.
- Reported behavior (enabling the OS pop-up toggle makes banners appear) indicates an OS/channel presentation restriction. Its exact owner/default on this device is not established. A successful delivery alone proves nothing about heads-up presentation.

## Focused changes

1. Silent card updates no longer consume the audible re-alert cooldown. An audible message following an initially quiet card requests attention through the supported renotify option. Existing five-second grouping cooldown remains.
2. Silent updates do not request renotify. Unavailable delivery lookup produces a generic quiet card because current mute preferences cannot be verified.
3. Notification IDs deduplicate offline fallback redelivery while the card remains present (bounded history). Existing message IDs still deduplicate authorized grouped messages. This is not a promise of permanent deduplication after a user dismisses a card.
4. Settings explains delivery versus floating banners, long-press navigation to the actual notification owner, Chrome site permissions, sound, DND and separate APK settings. No fake settings link or claim to override saved preferences.
5. Worker cache version advances; only the public offline screen is cached. No encryption, Google sign-in or messaging transport changes.

## Automated verification

PASS on 17 October 2026: production build, lint and TypeScript checks; 74/74 unit tests; authentication/authorization regression suite (55.00s, Google provider mocked); real Chrome worker notification suite (26.79s); offline/PWA suite (4.46s). The worker suite additionally verifies the mobile settings help, quiet-to-audible renotify/vibration intent, quiet generic fallback and notification-ID deduplication. The isolated test cluster was stopped after verification. Tests use disposable loopback database accounts and Chrome's actual service worker/Notification objects. Push events are injected with DevTools, not sent through external FCM/VAPID providers. Headless background visibility is simulated; closed-app-window handling uses the actual clients API. No physical Android heads-up result is implied.

## Physical-device acceptance — NOT VERIFIED

After an approved website deployment and worker update:

1. Use the Chrome-installed copy, grant browser/site notifications from Circlo Settings, enable sound and use an unmuted conversation. Do not clear storage or uninstall an existing trusted browser just to simulate a fresh installation: this can remove local encryption keys.
2. Record phone model, Android and Chrome versions; inspect about://webapks if available. Long-press an actual notification and record its app owner/channel and Alerting/Pop-up state. For fresh-install defaults, use a separate test device/profile/account.
3. With Circlo visible, send a message from a second test account: no system banner/card. With Chrome/Circlo backgrounded while using YouTube or another app, send a new message: check both panel delivery and actual floating banner separately. Repeat with the Circlo window closed (not Android force-stop).
4. Tap the notification: correct conversation/message, no duplicate window when an existing app window can be reused. Repeat after login expires: login preserves the destination.
5. Send a short burst: one grouped card and bounded re-alerts. Redeliver an event: no extra count while the card remains. Mute the conversation: no interrupting alert. Check sound disabled and DND: respect the OS/user settings.
6. If panel delivery succeeds but no banner appears, follow the in-app long-press Settings guidance. Record whether enabling the OS pop-up switch changes the result. Website code cannot enable that switch for the user.

## Conclusion

Browser-supported attention requests can make an authorized unmuted message eligible for interruption. Heads-up by default on the user's tested Android device is NOT VERIFIED and cannot be guaranteed or forced by a website. Existing saved OS preferences remain intact. No APK rebuild is required for these web changes. Production rollout requires explicit authorization and passing CI; implementation testing alone is not deployment evidence.

References: https://web.dev/learn/pwa/installation?hl=en ; https://developer.chrome.com/blog/notifications ; https://web.dev/articles/push-notifications-notification-behaviour
