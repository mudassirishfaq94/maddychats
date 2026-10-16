# Phase 3: owner-controlled configuration and signing

No commands in this document have created a Firebase project, key, release signature, deployment or Play submission.

## Identity decision — BLOCKED

The working build still uses `app.ziptalks.android`, versionCode12/versionName0.9.3. `chat.circlo.app` is only the owner's proposed new-listing identity. Do not rename it, generate a key or upload until the owner confirms the permanent package and existing Play listing history. A package change is a separate installation with separate encryption storage. Preserve the trusted old installation and link the new one; never clear data to work around upgrade failure.

## Firebase — configuration and phone verification required

FCM fits this existing WebView because the native Firebase service and SDK already exist. Browser/PWA installations keep their independent Web Push implementation. No TWA or second Android project is required.

After approval, in the owner's existing Firebase project:

1. Confirm the Android client package matches the **approved actual build identity**. Download its Android client configuration into the ignored/local build configuration location `android/app/google-services.json`. Do not replace a tracked configuration without reviewing project/package continuity. Client Firebase configuration is not a server private key; do not include service-account JSON in Android resources or Git.
2. Enable/verify the existing project's FCM HTTP v1 API, without enabling billing or creating a new project as part of this task. Confirm quotas and project ownership in Console.
3. Supply the backend's server-only `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` through the host's secret settings, following owner approval. The private key must be the service-account credential for that same project, with only the permissions required to send FCM. Never use `NEXT_PUBLIC_*`, paste it into source, logs, APK resources or this report. Rotate any previously exposed server credential.
4. Coordinate an approved database migration (`0049_fcm_session_binding.sql`) and backend/frontend deployment **before** distributing the updated APK. The legacy backend sends auto-displayed notification payloads; the new native handler expects data-only account-bound metadata. Do not mix them and claim privacy/duplicate protection has been verified.
5. Install the updated debug APK only on an authorized test phone, preserving storage/signature continuity. Sign in, complete existing device approval, then open Settings → Notifications → Enable. Only this explicit action requests Android13+ permission. A denied/disabled permission or missing configuration produces an actionable error, not a success banner.
6. Verify same-project token delivery using fake accounts. Never record tokens or full-device logs in Git. Test all rows in `PHASE_3_DEVICE_AND_CLOSED_TEST_CHECKLIST.md`.

Tokens are associated with the authenticated **session**, not a caller-supplied user ID. A new device no longer removes every other Android token. Logout removes only its own token; delivery additionally excludes revoked/expired/restricted sessions. Legacy/unbound tokens are ineligible until re-registration. Explicit account changes rebind the physical token. Invalid/unregistered Firebase tokens are removed on provider rejection.

The origin-limited AndroidX bridge only supports token/status permission, local binding and clearing. It rejects subframes and noncanonical origins, rechecks the top origin before asynchronous replies and has no cookie/key/arbitrary-code API. It requires an Android System WebView supporting `WEB_MESSAGE_LISTENER`; unsupported versions fail closed.

**Token refresh:** Firebase's native token-refresh callback makes one bounded (eight-second), redirect-disabled HTTPS registration request using the existing same-origin WebView session cookie in memory. It never persists another cookie copy, logs the token or stores server credentials. The backend derives the owner and rejects expired/revoked/restricted sessions. No local binding means no background enrollment attempt. Network failure or expired authentication falls back to the normal authenticated resume/retry path. There is no polling, refresh-token bypass or guarantee that a force-stopped/restricted process can run. Immediate and failed-background-refresh behavior remains NOT VERIFIED on a phone. DND, channel preferences and OEM battery restrictions also prevent or alter delivery.

Provider payloads contain opaque recipient/event/conversation/message or call routing identifiers, expiry and silent preference. They contain no names, message previews, plaintext or encryption keys. This metadata is still processor data and must be included in the Data Safety review. The native notification is generic. Foreground notifications are suppressed; background duplicates are deduplicated within a bounded100-event ledger. Android controls heads-up presentation. These properties have source/unit evidence; actual provider/device behavior requires the phone tests.

## Permanent upload key — approval required, not generated

Use the JDK already installed and an owner-only directory **outside every checkout**. After explicit key/identity approval, run interactively:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore '<outside-all-repositories>\circlo-upload.jks' -alias circlo-upload -keyalg RSA -keysize 3072 -validity 10000
```

Let keytool prompt for passwords; do not put them in arguments, shell history, source or Gradle properties. Limit filesystem access to the release owner. Keep two encrypted offline backups in separate controlled locations and passwords in the owner's password manager. Verify a restored backup using `keytool -list -v` before relying on it. Never replace a prior signing identity without a formal recovery/upgrade plan.

Google Play App Signing holds the **app-signing key** used for delivered APKs; the **upload key** signs the submitted AAB. Their public SHA256 fingerprints can differ. Google OAuth Android registration and verified App Links must use the right installed-app certificate. Debug, upload and Play app-signing certificates are not interchangeable.

## Signed AAB generation — deliberately not executed

1. Confirm the permanent package, final version and upload-key certificate. Check Play Console's highest uploaded versionCode; choose a strictly higher integer for every new upload. Change versionCode/name in `android/app/build.gradle` in a separately reviewed commit. The existing local12/0.9.3 artifacts are not automatically the final release.
2. Build the existing Gradle project with `JAVA_HOME`, `ANDROID_HOME`, `CLIENT_URL=https://circlo.chat`; run `:app:bundleRelease`. This currently creates an **unsigned** AAB, intentionally.
3. Copy the AAB to a private release directory outside Git and sign the copy with JDK jarsigner, prompting for the keystore password. If the key password differs, use a secure release runner/Android Studio signing wizard, never literal password flags:

```powershell
& "$env:JAVA_HOME\bin\jarsigner.exe" -keystore '<outside-all-repositories>\circlo-upload.jks' '<private-release-directory>\circlo-release.aab' circlo-upload
& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs '<private-release-directory>\circlo-release.aab'
& "$env:JAVA_HOME\bin\keytool.exe" -printcert -jarfile '<private-release-directory>\circlo-release.aab'
```

4. Require actual signature entries and `jar verified` output; an unsigned jar can return exit0. Compare its public signer fingerprint with the approved upload certificate, validate the signed bundle with official bundletool and inspect package/version/target/nondebuggable/permissions. Self-signed certificate warnings require interpretation; they are not permission to ignore a missing/invalid signature.
5. Store the approved hash/cert/version/build record privately. Keep keystores, passwords, signed binaries, reviewer credentials and service-account files out of Git. The existing inspection script intentionally rejects a signed AAB under the current **no-final-signing** gate; use a separately approved release verification procedure once signing is authorized.
6. Only after approval, enroll/verify Play App Signing, upload to the intended track, obtain its app-signing certificate and update the public DAL configuration if approved. Do not submit the debug APK or unsigned AAB.

Primary references: [AndroidX origin-scoped messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat), [Firebase Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started), [message lifecycle behavior](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission), [Android app signing](https://developer.android.com/studio/publish/app-signing).
