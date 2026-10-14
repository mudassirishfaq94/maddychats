# Notification navigation and readable wallpapers

Scope: retain the existing app, account authorization, encryption and saved wallpapers. The installed browser PWA is the primary mobile distribution; native Android source is also maintained. No new libraries, infrastructure or paid services.

## Findings and changes

- Web Push discarded the message ID and opened the latest page. Cards now carry the validated message deep link. The worker focuses an existing app window before navigating, uses the returned WindowClient rather than a potentially destroyed original client, and falls back to openWindow on failed/null navigation. Closed-app opening focuses the returned window when permitted.
- Offline cards retain an opaque notification ID, not sender information. On tap, an authenticated, private/no-store lookup can recover the destination after connectivity returns. Current account ownership is checked; unavailable lookups open the inbox.
- The authentication proxy dropped the query string from `next`. It now preserves the complete internal path and query, including the message link.
- Native Android never consumed notification intents, and FCM specified a click action without a matching activity intent filter. Remove that action, consume validated URL extras and app links on both initial launch and onNewIntent, distinguish foreground PendingIntents by destination, and use immutable/update-current flags. Default FCM channel/icon metadata now matches the existing high-importance Messages channel. Native Google authentication retains the pending destination.
- Capacitor attached token listeners after registration and removed every listener on completion/timeout, including the tap listener. Attach listeners first, remove only owned handles, install the tap handler before registration, and clean it up on unmount. Registration requests are bounded and HTTP failures are checked.
- Custom wallpaper palettes previously overwrote history-wide text, surface and accent variables. Dark wallpaper could have dark text; voice cards could combine unrelated palettes. Wallpaper now changes neither global text nor outgoing palette. Incoming bubbles use opaque theme surfaces; metadata, voice controls and outgoing text retain matching theme colors. Toolbars, dates, group sender labels, unread labels and empty states have opaque backplates.
- Default charcoal has a subtle linked-orbit signature tile, with a warm paper counterpart in light mode. It is a static inline SVG in CSS, with no per-frame work, dependency or network request. Existing custom image/pattern/gradient/opacity settings remain available.

## Android banner limits

Android determines heads-up/pop-on-screen presentation using channel settings, user overrides and Do Not Disturb. Web Push has no API to force a high-importance Android channel. `Urgency: high` controls push delivery priority, not banner presentation. The profile Notifications section now explains where to enable Alerting/Pop on screen. Do not bypass these settings or claim banners can be forced.

Sources: [Android channels](https://developer.android.com/develop/ui/compose/notifications/channels), [Android notification design](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications), [WindowClient.navigate](https://developer.mozilla.org/en-US/docs/Web/API/WindowClient/navigate), [Clients.openWindow](https://developer.mozilla.org/en-US/docs/Web/API/Clients/openWindow).

## Verification scope

Regression coverage includes worker focus/navigation failure and null-client fallback, exact message links, offline destination recovery, external URL rejection, account isolation, actual Chromium WindowClient navigation and sign-in redirect preservation. Rendered wallpaper tests use the real settings API across default, gradient, black, white, custom doodle and uploaded image, both palettes, 320px portrait and 844px landscape. Bubble text and metadata must meet 4.5:1 contrast. Existing encrypted photo/video/voice workflows remain in the regression suite.

No physical Android phone is connected. Browser emulation cannot certify Android banner presentation, OS battery restrictions, notification taps after a real external push, or manufacturer settings. Native Kotlin compilation checks source compatibility; Render deployment does not install a new native APK. A very old notification outside the loaded history opens the latest page rather than fetching unbounded history; the exact-message highlight applies when that message is in the recent page.

## Measured results

- 58 unit tests passed, including notification focus failure, null navigation fallback, exact message URLs, offline recovery, account isolation and unsafe URL rejection.
- Production build, TypeScript and ESLint passed. Android `:app:compileDebugKotlin` passed (existing deprecation warnings remain).
- Actual Chromium worker navigation and sign-in redirect preservation passed. Foreground quiet, grouped delivery, muted/read/expired/hidden message rejection, account switching and logged-out isolation passed.
- The rendered settings matrix passed at 320px portrait and 844px landscape in dark/light themes, including a real uploaded wallpaper. All sampled bubble text and metadata contrast ratios were at least 4.5:1, with no page overflow.
- No secrets found in the staged diff. No schema migration, new dependency or paid service was introduced.

## Chat-opening race reproduced and fixed

A deterministic browser test held the recipient's SSE connection, committed an encrypted message after the initial history rendered, then released the stream after its one-second replay window. The previous build failed to show that message without a reload. Chat history now performs a bounded, uncached, member-authorized catch-up on stream connection/reconnection, adding missing messages while retaining drafts, existing receipt state and older loaded pages. There is no polling loop. Requests abort on account/chat change or unmount and time out after ten seconds. The regression is included in the full workflow suite and can be run locally with `CHAT_RACE_ONLY=1 npm run test:restored` using the existing disposable-database variables.

Long-running fixture API calls now share their browser's current cookie jar, rather than replaying captured refresh tokens after access-token expiry. Production authentication and replay protections are unchanged.
