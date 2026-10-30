# Circlo 0.9.17 publishing candidate — 30 October 2026

**Decision: signed artifact prepared; production shipment not approved.** This checklist records the actual remaining gates rather than treating a successful build as a completed release.

## Artifact identity

- Package: `chat.circlo.app`; version name `0.9.17`, version code `26`; target API 36.
- Android source/build snapshot: `38e3df852483b25a82b75ad37c4d72cc90791fe9`.
- Publishing artifact: `Circlo-0.9.17-play.aab`, 2,339,205 bytes.
- AAB SHA-256: `914de49d4d3261df8dffb02640f93d725c11d5b24661d88c54a639c6384d6b59`.
- Upload certificate SHA-256: `d0f6b7df9b7ca968bb96f88fb2aa48cb0a0987699e5245aae32a5d6cddb3eb9f`.
- Bundle-derived device-test APK SHA-256: `aa1d89d92cbbed48cc0ed98a74e49d8bcf085d955f0ca9d352df0fddca9b3ec0`.
- Artifacts/evidence are outside Git in the owner's `Documents/Circlo-Releases/0.9.17-play/` directory. No signing secrets are included in this report.

The AAB uses the existing approved upload key. The device-test APK uses the existing local test certificate so it can update the installed test app without uninstalling it or losing chat keys. It is not the publishing artifact. Do not uninstall the current app to install an APK with a different signer; plan device linking/backup before switching signing identities.

## Objectives and evidence

| ID | Requirement | Result and evidence |
| --- | --- | --- |
| R01 | Build a normal publishing bundle | **PASS.** Gradle `:app:testReleaseUnitTest :app:lintRelease :app:bundleRelease :app:assembleRelease`, without `circloProfile`; build successful in 1m18s. |
| R02 | Exact package/version and approved signing key | **PASS.** Signed AAB inspected with bundletool, keytool/JAR verification and `verify-signed-android-release.py`; signer exactly matches approved public certificate. |
| R03 | Non-debug release and profiling disabled | **PASS for build/configuration.** Generated release BuildConfig has `DEBUG=false`, `WEBVIEW_PROFILING=false`, version26. Manifest is non-debuggable, cleartext disabled, OS backup/transfer exclusions present. Fresh physical launch/debug-socket check pending unlocked phone. |
| R04 | Reviewed permissions and file alignment | **PASS.** Exact 13-permission inventory in `release-permissions.json`; no broad contacts/location/storage/boot permissions. APK zip alignment checked for 16KB pages. Neither artifact packages native `.so` libraries; native ELF alignment is not applicable to this bundle. |
| R05 | Artifact verifier fails closed | **PASS.** Actual APK rejected for wrong certificate; actual AAB rejected with an incomplete reviewed inventory; old minimal permission policy still rejects the broader hosted-app inventory unless supplied explicitly. APK/AAB version equality is checked. |
| R06 | Android tests/lint | **PASS with warnings.** 34 release unit tests, zero failures/errors. Lint: zero errors, 86 warnings; not a warning-free result. |
| R07 | Web regression evidence | **PASS for recorded scope.** 193 unit tests, TypeScript, targeted lint and production webpack builds. Private cache/history tests retain account isolation, membership reconciliation, expiry, locks and logout. |
| R08 | Real uploads | **PASS in isolated browser tests.** PDF, Word, Excel, CSV and real APK encryption/decryption with byte-identical recipient downloads. Photos/videos reserve readable 4:3 frames, remain stable across decode and open full viewers. Not a fresh physical test of every external reader application. |
| R09 | Install on owner's phone without losing data | **PASS.** Bundle-derived normal release-test APK installed with `adb install -r`; no uninstall, clear-data or key reset. |
| R10 | Usable list and first chat consistently below one second | **OPEN.** Recorded force-stop run on prior installed release/live `speed-8884826`: cached list694ms, first chat2174ms. Binding-only stress sample724/724ms is a separate condition. These do not prove a universal maximum. Eager chat-code loading is staged but undeployed; do not claim its physical after-timing yet. |
| R11 | Final physical launch/background notification/permissions regression | **OPEN.** Phone connected but dozing at the last check; unlock requested. This release's install success is not proof of complete runtime behavior. |
| R12 | Production website and release match | **OPEN.** Bluehost remains healthy on `speed-8884826`. Latest privacy, retention, thumbnail and chat-code changes remain in draft PR73, not deployed under the owner's latest instruction. |
| R13 | Dependency security evidence | **PASS for current npm production inventory.** `npm audit --omit=dev --json` reports zero advisories at this check. This does not close default-branch Dependabot alerts or certify Android SDKs against all vulnerabilities. |
| R14 | Accurate public policies/contact/deletion | **Review candidate ready; not live.** Six public routes return200 live. Revised pages pass six-width and internal-link checks locally; owner-approved contact retained. Operator legal identity, transfer arrangements and unspecified retention periods still need review. See privacy consistency report. |
| R15 | Play app setup, signing enrollment and reviewer access | **OPEN / external.** Owner confirmed no prior upload/listing for this project. Console configuration, Play App Signing certificate, declarations, rating/audience, reviewer access and testing-track requirements have not been completed by this task. |
| R16 | App-link association | **OPEN.** Public `/.well-known/assetlinks.json` returned503 at this check. Actual Play app-signing certificate is not yet available. Do not substitute the debug certificate or assume upload key equals the Play signing key. |
| R17 | Call-service permission declarations | **OPEN / Console.** Full-screen call and foreground microphone permissions require accurate declarations and eligibility review; preserve existing voice-call functionality rather than deleting permissions to bypass review. |
| R18 | Encryption/backup claims and licensing | **OPEN for remaining work.** Supported chat path is conversation-key E2EE; Status is currently readable to the service; experimental Signal sending remains quarantined. Do not label Signal ratchet migration, hardware storage or Status E2EE complete. Private source package is for licence review, not publication/compliance approval. |

## Measured startup evidence and next authorized action

The captured cold-chat trace shows on-demand chat-code downloads after provider/layout work. The staged eager import addresses that specific waterfall; it is not a measured improvement until the hosted candidate is deployed and the same physical scenario is repeated. Cached ephemeral/disappearing content must stay excluded even when that prevents a favorable cached-text benchmark.

After explicit deployment approval: publish public hashed assets safely, switch the reviewed server build with rollback retained, confirm release identity/readiness, then measure force-stop → usable list and first tap → real readable message on the unlocked Poco. Record repeated runs and network conditions separately; do not report activity-draw time as usable-list time. Recheck membership removal, expiry, account switching/logout and privacy before approving shipment.

## Current policy references

- [Target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878): current new-app submission requirement is API36.
- [Foreground service and full-screen intent declarations](https://support.google.com/googleplay/android-developer/answer/13392821): applicable calling/microphone declarations must match actual functionality.
- [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756): upload and app-signing keys have distinct roles.
- [Applicable personal-account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465): verify the owner's Console requirements; sideloading does not fulfill a closed-test track.

No Play upload, production deployment, purchase, user-data deletion or security-protocol relaxation was performed to produce this candidate.
