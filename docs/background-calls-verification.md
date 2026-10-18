# Background incoming calls — 18 October 2026

The approved messaging release is on main. Additional calling changes are on `codex/background-incoming-calls`; physical end-to-end tests require the Render release to be live.

## Changes

- High-priority data-only FCM displays native incoming calls without a WebView. Account, exact call destination, deadline, duplicates and cancellation are checked.
- A private native incoming-call screen offers Answer/Decline when Android permits full-screen presentation; otherwise the actionable notification remains. Muted channels, silent mode and OS restrictions are respected. Ringing never starts the microphone.
- Answer opens the authenticated app for that call. Unlocking may be required before the WebView connects. Offline Decline dismisses locally and relies on the server deadline if it cannot reach the authenticated endpoint.
- After microphone permission and an explicit start/answer, an exact-origin bridge starts a microphone foreground service. It verifies the bound account and live owned call, maintains signaling independently of SSE, holds only a bounded wake lock and requires a renewing WebView lease. Logout, task removal, lost WebView and call completion stop it. No SDP, keys, media or cookies are persisted by the service.
- The ongoing-call notification supports Return/End. Returning preserves WebRTC instead of reloading the WebView.
- Optional TURN_URLS/TURN_SECRET support expiring coturn REST credentials. The shared secret stays server-side and user identifiers are pseudonymized. A reachable TURN server is still required for restrictive networks; no paid service was added. Without configuration, direct calling remains available.
- Settings expose Android call-channel/full-screen controls without silently changing permission, battery or Do Not Disturb preferences.
- Automatic Answer requires one-time, account/call-bound local proof from the immutable native notification/private incoming activity or the PWA notification-click handler. An ordinary URL cannot consent to microphone capture. PWA proof is consumed atomically in device-local IndexedDB; native proof is consumed through the exact-origin bridge. No proof or encryption key is transmitted through push providers.

## Evidence

Debug and non-debuggable release builds passed. All 14 JVM tests passed, including new recipient/destination/deadline validation. Typecheck and targeted lint passed. The 22 targeted call/push/PWA/bridge tests passed, including relay credential isolation and expiry.

Additional Answer-proof/PWA tests passed (16 tests in the focused run). A new native proof-binding JVM test and rebuilt APK are being verified before physical calls. The user enabled full-screen notification permission; ADB confirmed the UID-level permission is allowed. No battery exemption was changed.

A new Chromium regression closes the recipient page, cold-opens the Answer deep link, establishes real WebRTC with fake audio devices, then declines another call with SSE unavailable. These new assertions require a passing CI run before being reported verified.

Poco X7 Pro is connected through authorized ADB, Android 16/API 36. Notifications were granted; microphone permission was initially absent, so the normal Answer permission flow must be tested. A debug update was correctly rejected for certificate mismatch. No uninstall or data clear occurred. The existing release certificate was located and matched against the installed APK; the release-signed test update installed in place, and the user confirmed their signed-in account remained available. Signing credentials stayed outside Git and the password remained in signing-process memory. No Play upload or Firebase project mutation occurred.

## Physical tests still pending

Use two accounts in an accepted one-to-one chat. Record arrival, actions, bidirectional audio and remote outcome for foreground, Home/minimized, locked screen, and swiped-away task. Check caller cancellation, timeout, duplicate suppression, offline Decline and second-device Answer. During an active call, check audio after Home/lock, return without reloading, and End from the ongoing notification. Test Wi-Fi and cellular separately.

Test default Poco/HyperOS battery settings first and document any user-enabled autostart/battery exemption separately. A force-stop is a distinct unsupported platform state, not equivalent to swiping the task away. A closed PWA alert does not establish background microphone support. Full-screen and foreground-service declarations require appropriate Play Console review for store distribution. Physical calling, background audio continuity and TURN-backed cellular behavior remain unverified.

References: [Android time-sensitive notifications](https://developer.android.com/develop/ui/views/notifications/time-sensitive), [foreground-service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [FCM priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

## Production rollout and Poco findings

Main commit `9cae97c` passed both remote workflows and deployed automatically to Render on 18 October 2026. The public version endpoint matched its full SHA, health returned 204, migrations completed, and unauthenticated ICE configuration returned 401 with private/no-store caching. Final reliability CI passed 104 unit tests, eight PostgreSQL tests, production-bundle encrypted browser workflows and Android compilation/JVM tests. The broader Quality job passed its security, mobile, offline-PWA and container-startup checks.

The Poco user confirmed an incoming call while at Home, Answer and bidirectional audio. A separate locked-screen test failed: the alert arrived, but Answer did not open/connect the call; the caller saw ended/not answered. The user subsequently saw the microphone unavailable message. This is a physical failure, not a working locked-screen result. A Chromium communication-device error was observed, without a server application error in the test window.

Follow-up native changes keep the private incoming activity alive until keyguard dismissal succeeds, preserve the expiry/account checks, issue the one-time Answer proof only when opening the unlocked app, and route notification Answer through the same activity. Cancelling unlock permits retry without granting microphone access. These changes need a signed in-place update and physical retest; they do not bypass the lock screen. See [Android keyguard dismissal lifecycle](https://developer.android.com/reference/android/app/KeyguardManager#requestDismissKeyguard(android.app.Activity,%20android.app.KeyguardManager.KeyguardDismissCallback)).

The user also reported intermittent logout after removing the task from Recents. Inspection found that legacy cookie import protected only the short-lived access cookie, potentially overwriting a valid remaining refresh cookie; native call/token requests ignored server Set-Cookie renewal responses; normal WebView page/background lifecycle did not explicitly flush cookies. The native follow-up preserves either existing authentication cookie, synchronizes secure HttpOnly renewal cookies back to the same WebView jar with account-switch/late-response guards, and schedules cookie persistence off the UI thread. Server expiry, replay checks and revocation remain unchanged. New JVM regressions cover remaining-refresh migration, renewed-cookie filtering and late responses after logout/account switch. Real-device restart/long-idle verification remains required.

No TURN server exists yet (confirmed by the user); restrictive-network audio remains an infrastructure limitation. Locked/swiped-task behavior, active-call lock continuity, cancellation and repeated restarts must be measured independently. The native follow-up is separate from the currently deployed web commit until its verification is complete.
