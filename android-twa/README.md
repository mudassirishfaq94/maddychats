# Circlo Android TWA preparation

Separate release tooling for the existing `https://circlo.chat` PWA. This does not change the web architecture or the legacy `../android` project. **No signed APK/AAB or generated Android project is included.** See [readiness report](../docs/android/GOOGLE_PLAY_READINESS_2026-10-16.md).

## Current stop conditions

1. Confirm whether `app.ziptalks.android` is already in Play and retain its signing/package identity if this is an update. Existing source versionCode is12; Play may have a higher one. No new package is selected here.
2. Confirm the **Play app-signing** certificate SHA-256. The upload certificate can differ. Do not publish debug trust. No keystore or password is provided or generated.
3. **Bubblewrap1.27.0 tooling audit is currently failing:** initial pinned install reports14 findings (9high/5moderate), including unpatched extract-zip and node-forge and old Google API/Jimp dependencies. This is isolated development tooling, not a new web runtime dependency. Do not give it production credentials, run its downloader on untrusted archives or sign/release with this unresolved toolchain. Do not run `npm audit fix --force`: npm proposes an obsolete0.5.1 downgrade, not an acceptable fix. Use a reviewed patched upstream release or a separately reviewed minimal patch/container workflow before building. The lockfile preserves exactly what was inspected, not a security endorsement.
4. Java/Android SDK/ADB were not on PATH; no physical Android test, Play Console review or live DAL verification has occurred.

`android-twa` is excluded from the production Docker context and has its own package/lockfile. Never add Bubblewrap to root application dependencies.

## Safe checks available now

From this directory:

```powershell
npm ci --ignore-scripts
npm test
npm audit --audit-level=high
npm run preflight
```

Tests validate configuration trust boundaries without loading Bubblewrap or creating keys. Audit is expected to fail until upstream/tooling remediation. The `bubblewrap` script fails closed on an unsuccessful audit before loading the CLI, permits only unsigned builds, rejects publishing/signing and fixes generation to the ignored project directory. Preflight is expected to fail until real local inputs and a generated project exist; it never claims complete release readiness.

## Configuration after owner confirmation

Create ignored `.local/release-inputs.json` using `release-inputs.example.json`. Keep the signing key at an absolute location **outside the repository**; store passwords in a password manager, never in JSON/CLI arguments/source. Windows file ACLs must also protect the key. The example deliberately cannot pass validation.

```powershell
npm run configure
```

This writes only ignored `project/twa-manifest.json` and `.local/assetlinks.json`. No keys, build, deployment or permissions are created. Notification delegation is enabled, origin is exactly `circlo.chat`, additional trusted origins are empty and fallback is browser Custom Tabs. Do not trust Google OAuth origins as your own. The current interface, auth, E2EE, uploads and web push remain in the browser.

## Generate/build only after resolving the tooling audit and release decisions

Use the reviewed pinned Bubblewrap command from this directory; do not use an unpinned global/latest version. Bubblewrap can install Java/SDK and requires accepting their licenses; this has not been done.

```powershell
npm run bubblewrap -- doctor
npm run bubblewrap -- update --skipVersionUpgrade
npm run preflight
```

The wrapper runs Bubblewrap `update` inside `project`, using its prepared manifest; this was confirmed against the pinned CLI's source. It cannot target the legacy Android or repository root through directory/manifest flags. No interactive initialization/key generation is needed. Never overwrite a hand-maintained project with Bubblewrap update.

After generation, inspect SDK/permissions and use `npm run bubblewrap -- build --skipSigning` for local artifact inspection. Do not skip PWA validation. Source preflight does not replace inspecting the final merged AAB with Android tooling. Do not run any `play publish` command or bypass the audit wrapper.

Final signing, publishing `/.well-known/assetlinks.json`, infrastructure changes and any Play upload remain separately approval-gated. DAL fingerprints are public, but production trust changes must still be reviewed. Test a Play-signed installation with its own actual fingerprint; an upload-key-signed local APK needs an explicitly reviewed test strategy and must not silently expand production trust.

## Required acceptance evidence

- API36+ target in compiled artifact; no unnecessary broad photo/storage, boot, native FCM or future biometric permissions; release non-debuggable, no HTTP and no unreviewed native libraries. Check16KB compatibility.
- DAL verification without developer bypass; correct launcher icon/splash, browser fallback, external OAuth navigation and Android back/keyboard behavior.
- Two fake-data accounts: signup/password/Google/MFA, six-digit device linking/email recovery, persistent and revoked sessions, E2EE text/media/groups/rekey, retry without duplicate messages.
-10MiB file picker/preview/caption uploads, mic allow/deny/record, reconnect, cold/offline launch and an update during an active send.
- Android13+ notification allow/deny, foreground suppression, background/closed-app delivery, exact-chat tap, no stale-user leakage, cancelled calls. Heads-up and force-stop limitations disclosed honestly.
- Public deletion request/support, verified removal/retention, UGC report/block/moderation, child-safety scope/contact, Data Safety, rating and reusable reviewer access completed by owner.
- Matched staging performance before/after and mobile accessibility/large fonts, Android16 back/edge-to-edge behavior. No production load testing.

Commit reviewed source/docs/lockfile only. Generated project, local config, signing material and outputs are ignored. Do not push without reviewing the complete staged file list and secret scan. No publication or release guarantee is implied.
