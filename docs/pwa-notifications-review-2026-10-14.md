# Installed Circlo branding and notifications

Scope: the web app installed through a browser's Install app / Add to Home Screen menu. This does not publish a native Android package or change native Firebase credentials.

## Changes

- Standalone startup HTML shows the approved linked-circle logo, Circlo wordmark and “Your circle. Your secrets. Sealed.” It disappears on hydration without an artificial delay. Normal browser tabs do not show the overlay. Existing manifest icons provide the OS-controlled splash screen.
- A small installed-app prompt links to Profile > Notifications. Permission is requested only from the Enable button, never automatically.
- The worker suppresses app-generated notifications while any Circlo app screen is visible, and clears existing alerts when the app becomes visible. The in-app inbox continues receiving events.
- Background/closed-window notifications have a branded icon and transparent monochrome status-bar badge, one replacement card per account/chat, a bounded message count, duplicate delivery protection, Open chat and Dismiss actions, and safe same-origin navigation to the latest message. Sound/vibration respect the saved sound preference; the OS ultimately controls presentation.
- Web Push carries identifiers, not chat text or sender details. The worker resolves presentation through an authenticated, noncached API that rechecks account ownership, unread status, current membership, deleted/expired/hidden messages, DM blocks, mute/archive state and notification preferences. Logging out or switching accounts cannot resolve a previous account's private notification. Network failures produce only a generic activity alert.
- Already-permitted subscriptions rebind on account changes. In-app notification IDs are deduplicated across realtime replay.
- No new paid service, polling timer, shared cache, migration or dependency is required. Private pages, media and API responses remain outside the offline cache.

## Verification and limits

`npm run test:unit` passes 55 tests, including worker visibility, grouping, safe navigation, stale-account rejection and offline privacy tests.

The loopback-only `PWA_ONLY=1 npm run test:restored` test creates disposable users and encrypted message fixtures. Playwright drives the actual production build and service worker. Chromium's DevTools push delivery exercises real worker execution, authenticated API requests and Notification objects. Verified startup branding at 320px, overlay removal after hydration, foreground quiet behavior, grouping/redelivery, silent preference, actual delivery with no app window, mute, account switching and logout. Headless Chrome reports all tabs visible, so **background client visibility is explicitly simulated**; closed-window delivery uses the actual clients API. No third-party push gateway is called by these tests.

This does **not** prove delivery from a push provider to a physically closed Android/iOS app, or exact phone OS presentation. On iPhone, users need an installed Home Screen app on a supported iOS version and a gesture to grant permission. Force-stop, disabled permissions, battery restrictions, offline connectivity and expired sessions can prevent or delay delivery. User-visible-only push rules may cause browser-generated fallback notifications when a push is suppressed; foreground suppression needs checking on the actual target browser before promising identical behavior across platforms. References: https://webkit.org/blog/13878/ and https://webkit.org/blog/14112/badging-for-home-screen-web-apps/.

Real-device acceptance: install from https://circlo.chat, enable Profile > Notifications, send from a separate owned account while foreground/background/closed, tap Open chat, test mute and sound off, then switch accounts/logout and repeat. Confirm that no notification exposes plaintext message contents. Do not test against unrelated users.

The previously documented legacy encryption-backup migration remains outstanding. This change neither deletes nor weakens existing device keys.
