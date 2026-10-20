# Package identity, signing and Digital Asset Links

Owner response16 October 2026: keep `chat.circlo.app` proposed; **no final signing yet**. Android identifier syntax is valid. Do not rename the existing `app.ziptalks.android` code or assume package availability/Play ownership. VersionCode must exceed every previously uploaded version for the final package. `identity.proposed.json` is a decision record, not release configuration.

## Signing checklist

1. Confirm new listing vs existing listing in Play Console. Obtain explicit approval of the permanent package and signing identity. Never replace a prior production key.
2. Resolve tooling advisories; use a clean, reviewed build environment without production API/mail/database credentials. Separate debug/local testing, upload and Play app-signing identities.
3. For a new approved upload key, use the Android/JDK `keytool` interactively. Keep its path outside all Git checkouts and synced/public folders. Example structure only: `keytool -genkeypair -keystore <outside-repo>/circlo-upload.jks -alias circlo-upload -keyalg RSA -keysize 3072 -validity 10000`. Passwords must be prompted, never literal command arguments. This command was **not executed**.
4. Restrict filesystem permissions to the owner, encrypt an offline backup, record alias/owner/expiry in a password manager and verify the backup can be opened. Android app-signing rotation/expiry decisions require Play guidance.
5. Inspect public cert: `keytool -list -v -keystore <outside-repo>/circlo-upload.jks -alias circlo-upload`. Do not print/export private keys. A debug key is not a production key.
6. With Play App Signing, obtain SHA-256 of the **app signing certificate** from App integrity. It usually differs from the upload certificate. An APK installed directly has the certificate actually used for that APK; test it separately. Do not automatically trust debug/upload certificates on production.
7. Build and verify artifact signatures using `apksigner verify --verbose --print-certs <apk>` and `jarsigner -verify -strict -verbose <aab>`. Inspect package/version/target SDK with Android tooling. Archive checksums/public cert hashes alongside private release records; APK/AAB/keystores remain ignored.

No signing, key generation, app registration or artifact upload is currently authorized. Documentation is not an executed build.

Phase 2 discovery: the existing sideloaded-project APK is debug-signed under `app.ziptalks.android`; no production signing key/listing has been established. A new debug test APK reused that existing debug certificate. This is **not** final release signing approval. Google Play must not receive a debug-signed release. A production certificate or different final package may prevent in-place updates from friends' debug APKs. Keep the old trusted installation until the new app is linked or a verified recovery backup is saved; do not uninstall or clear its data as a migration shortcut. Moving WebView storage into Chrome/TWA also requires deliberate secure enrollment. No account deletion or automatic trust reset is part of that migration.

## DAL implementation and approval-gated deployment

Next App Router serves `src/app/.well-known/assetlinks.json/route.ts`. It is public, GET/HEAD accessible, independent of session authorization. Private signing material must **never** be deployed to Render. With missing/disabled/malformed inputs it returns503/no-store instead of publishing fake trust. Valid explicit inputs produce JSON200 with a5-minute cache. Runtime settings are public configuration, not secrets:

```
TWA_DAL_ENABLED=1
TWA_ANDROID_PACKAGE_ID=<approved final package>
TWA_CERT_SHA256=<actual colon-separated SHA256; comma-separated only for explicitly approved additional certificates>
```

At most four distinct, explicitly approved fingerprints are accepted. Format validation does not prove certificate ownership or signing continuity. Keep disabled until the actual package/certs and production trust change are approved. No environment/deployment changes were made in this phase. Local test fixtures are not real signing certs and must never be deployed.

The relationship is `delegate_permission/common.handle_all_urls`, target namespace `android_app`. The final target must exactly match the installed package and actual signing certificate. TWA config `fingerprints` and Android app website declaration must agree with the web response. Do not trust Google OAuth or arbitrary external origins.

## Validation procedure after approval/deployment

1. `curl --fail --show-error https://circlo.chat/.well-known/assetlinks.json` without cookies. Expect HTTPS200, JSON, no login/HTML redirect. Repeat with an expired browser cookie to ensure it remains public. Confirm TLS and canonical host.
2. Compare the response package/fingerprint to `apksigner` for a sideloaded APK, or the Play app-signing certificate for a Play-installed APK. Cache TTL is300seconds; allow refresh after rotation.
3. Install on an actual Android device with current Chrome. Open Circlo without bypass/debug flags and verify no Custom Tab toolbar on the verified origin. Test external OAuth navigation and return, notifications and exact-chat links.
4. Inspect Android App Links with `adb shell pm verify-app-links --re-verify <package>` and `adb shell pm get-app-links <package>`; this is additional evidence, not a substitute for the TWA browser ownership check. Never use a debug verification bypass as a PASS.
5. Negative test a non-matching cert: it must fall back to browser-controlled UI, not obtain trusted full screen. Record device/browser/build/version/cert and observed results without secrets.

Status: local implementation prepared; live endpoint and installed TWA relationship **NOT VERIFIED**. Production currently still has the baseline404 until a separately approved deployment.
