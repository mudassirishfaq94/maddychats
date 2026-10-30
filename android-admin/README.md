# Circlo Admin for Android

A separate private Android app (`chat.circlo.admin`, Android 8+) opening the existing protected Circlo admin panel. It installs alongside Circlo and keeps its sign-in separate. No administrator credentials or permissions are bundled in the APK.

## Included

- Existing overview, users, message **metadata**, activity, reports, storage, security and admin history pages. Existing destructive-action confirmation and audit checks remain on the server.
- Responsive four-item bottom navigation plus a drawer for the remaining tools.
- Control room: measured database-query time, current app-process uptime/memory, pending reports, failed sign-ins in the last 24 hours and scheduled-message counts. Refreshes every 15 seconds only while visible; uncached and protected by existing role and MFA checks.
- Save the control-room snapshot through Android's folder picker. Only explicitly allowed report types, up to 16 MiB, from the Circlo origin are supported.
- Phone screen-lock protection on launch and after 60 seconds away when the phone has a screen lock. Screenshots and app-switcher previews are blocked. TLS errors stop loading; cleartext traffic, arbitrary native commands and automatic app-data backup are disabled.
- Camera permission requested only when a trusted Circlo page needs camera capture for device linking. The app does not read contacts or request microphone/storage permissions.

## Sign in

Use your existing administrator email/username and password, then the code from your code app. Admin tools do not require linking an old phone or restoring chats. The app does not make an ordinary account an administrator. Unlinked admin sessions keep the existing 15-minute restriction; sign in again when that session expires. This does not approve the device to read chats.

Google sign-in opens in the external browser, where its session stays. It does **not** sign the embedded admin page in; use password sign-in in this APK. No Google OAuth redirect or server authentication protocol is changed.

## Build

Install JDK 17+ and Android SDK 36; set JAVA_HOME and ANDROID_HOME. From this directory run:

```powershell
.\gradlew.bat :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease
```

The release output is `app/build/outputs/apk/release/app-release-unsigned.apk`. Release builds are minimized and WebView debugging is disabled. For the existing locally protected Circlo release key, run `scripts/sign-admin-apk.ps1` from the repository root with `-SigningDirectory` and an `-OutputApk` path outside Git. It checks app identity and debug status, aligns, signs and verifies the APK without printing passwords. Otherwise use Android SDK `zipalign` followed by `apksigner` with your private release key; keep keys and signed outputs outside Git. Do not use a debug key for distribution.

## Server release

The APK points to https://circlo.chat/app/admin. Existing tools need the existing server; the new Control room and bottom navigation need this branch's web changes deployed. A server rollout is separate from installing the APK. No database migration is required by the admin additions.

This is an online WebView client, not a native rewrite or an offline admin database. It does not include push alerts, infrastructure restart buttons, billing tools or unrestricted message access. Server API checks remain authoritative if the APK is copied to another phone.
