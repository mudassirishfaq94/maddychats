# Circlo — Google Play Phase 3 results

16 October 2026. **Local notification implementation/build work completed; official closed-testing readiness remains BLOCKED.** Existing Android architecture retained. No GitHub push, deployment, production migration/configuration change, Firebase project/billing change, permanent key generation, release signing, Play upload or publication occurred.

PASS is limited to the evidence stated. FAIL means a demonstrated missing/defective requirement; BLOCKED means a prerequisite or owner action is missing; NOT VERIFIED means no adequate runtime/operational evidence. No Play approval, universal delivery or performance guarantee is made.

## 1. Completed fixes

| Requirement | Status and evidence |
|---|---|
| Existing Android implementation identified/reused | **PASS:** active `MainActivity` extends ComponentActivity and creates a hosted WebView. Existing native helpers/Firebase remain; Capacitor dependencies alone do not make this BridgeActivity or TWA. No new project generated; original root APKs untouched. |
| Missing native notification connection | **PASS implementation/build:** `HostedPushBridge.kt` uses AndroidX `WEB_MESSAGE_LISTENER`, exact canonical origin and main-frame checks, top-origin revalidation on replies, bounded input/commands. No arbitrary JavaScript interface, key export or auth bypass. Actual injection/permission behavior on a phone **NOT VERIFIED**. |
| Android13+ permission and Settings feedback | **PASS implementation:** explicit Settings Enable calls the permission launcher; automatic registration uses a quiet probe. Denial, missing bridge/config and rejected registration no longer claim success. Actual Android dialogs **NOT VERIFIED**. |
| Multi-device token registration | **PASS local HTTP/database:** `POST /api/push/register` now binds token to server-derived session. Registering another phone preserves the first phone. Same physical token rebinds on authenticated account change. |
| Logout and revoked-session delivery eligibility | **PASS local registration/logout integration:** current logout removes only its token, other sessions retained, revoked session rejected. Sending joins active/unexpired/approved sessions; legacy unbound tokens excluded. Provider delivery eligibility and queued phone behavior still require acceptance. |
| Provider privacy and invalid tokens | **PASS unit:** native payload contains only routing metadata, expiry and silent flag, no sender/preview/plaintext/keys. Invalid/unregistered tokens retired; transient failures retained; transport awaits all sends. Existing route `after()` lifecycle keeps provider work off message/call response delivery. |
| Native presentation and taps | **PASS source/build:** generic notification, private lock-screen visibility, foreground suppression, account/expiry checks, bounded100-event duplicate ledger, immutable direct Activity PendingIntent, message and call query preservation. Actual background/closed/tap/dedupe behavior **NOT VERIFIED** on a phone. |
| Token refresh | **PASS implementation/build:** Firebase callback uses one8-second, redirect-disabled HTTPS request with the existing WebView cookie in memory; no persisted credential copy/polling. Backend enforces current session. Foreground/resume retries current token. Expired-auth/network/force-stop behavior **NOT VERIFIED** physically. |
| Notification preference changes | **PASS source/type/build:** preferences checked on resume; disabling push clears native binding and notifications. An epoch guard prevents an in-flight registration from restoring a disabled local binding. Browser Web Push remains separate. Phone preference/channel acceptance **NOT VERIFIED**. |
| Encryption/interface preservation | **PASS scoped diff:** no chat cryptography, key derivation, message plaintext fallback or mobile layout rewrite. Authorization, typing, report/block and deletion regressions pass locally. This is not a new independent crypto audit. |

Migration: `drizzle/0049_fcm_session_binding.sql`, registered in the migration journal. It adds nullable FK `fcm_tokens.session_id` with cascade on session deletion. Legacy rows are deliberately ineligible until re-registration. Rollback SQL is recorded in the file; roll back application readers before dropping the column. No live table was changed, and live migration lock duration is NOT VERIFIED. Plan a staged/approved deployment, not a blind production run.

## 2. Notification architecture and implementation status

Browser/PWA → existing VAPID service worker. Hosted Android → origin-scoped port → Android permission/Firebase token → authenticated same-origin registration API → session-bound PostgreSQL record → backend Firebase Admin **data-only** send → one native service → generic notification → validated conversation Activity route.

The previous frontend assumed Capacitor plugin availability in a plain WebView; native taps could throw before registration. The API also removed every other Android token for that user, and logout did not retire tokens. These demonstrated integration/state defects were fixed.

`NativePushState`, `PushPolicy`, `NativeTokenSync`, `MyFirebaseMessagingService`, `native-push-bridge.ts`, `capacitor-push.ts`, `native-push-payload.ts`, `native-push-delivery.ts`, notification preferences/provider and `web-push.ts` are the implementation locations. Firebase project consistency, delivery/refresh while closed, Android channel/heads-up, process death, offline WebView handling and exact native Google auth remain **NOT VERIFIED**. Android controls heads-up and force-stop restrictions; no battery/polling workaround was introduced.

**BLOCKED operationally:** external Firebase/backend configuration and coordinated deployment approval. The updated APK must not be distributed against the legacy auto-notification backend and represented as tested. Legacy/full-Capacitor platform tokens are not opted into the new data-only protocol automatically. See [exact configuration/signing procedure](PHASE_3_SIGNING_AND_CONFIGURATION.md).

## 3. Signing readiness

**PASS preparation; BLOCKED final release.** Existing local identity `app.ziptalks.android`,12/0.9.3 retained; `chat.circlo.app` remains proposed per owner instruction. Current APK is debug-signed with the pre-existing certificate. Current AAB is **unsigned**, not upload-ready. No key replaced/generated.

The [signing procedure](PHASE_3_SIGNING_AND_CONFIGURATION.md) covers owner approval, outside-repository interactive key creation, restricted/encrypted backups and restore verification, upload key versus Play app-signing key, signed-copy AAB generation, actual signature/certificate verification, versionCode monotonicity and DAL/OAuth certificate distinctions. Final package/version/key decisions cannot be inferred from a successful sideload.

## 4. Remaining Play compliance blockers

| Requirement | Status and remaining action |
|---|---|
| Target API | **PASS artifact:** target/compile36, min24. Current official policy requires36 for this app type; recheck before upload. |
| Sensitive permissions | **PASS static artifact:** Internet/network, microphone, notifications/vibration/wake, FCM receive and signature-only receiver permission. No broad media/storage/camera/boot/biometric permission added. Actual prompts/picker/mic **NOT VERIFIED**. |
| Account deletion | **PASS local:** public browser page, protected in-app deletion, both cookies expired, DB cascades, owned orphan removal and shared-file preservation tested. **BLOCKED/NOT VERIFIED:** live deployment/cleanup schedules, historical uploads, processor backups and all-device cache lifecycle. |
| Privacy policy | **PASS local/public-page checks:** accessible policy with honest encryption/retention limits. **BLOCKED:** owner operational accuracy/sign-off and approved live changes. |
| Support contact | **BLOCKED:** no owner-confirmed monitored public email; no address invented. |
| Data Safety | **BLOCKED:** owner/Console declarations and actual provider/SDK inventory/retention review; Firebase opaque routing/token metadata is still data processing. |
| Reporting/blocking | **PASS local API/UI:** report retry, block persistence, authorization and symmetric DM/call/typing refusal. **NOT VERIFIED/BLOCKED:** full Android reporting scope, group/status handling acceptance, staffed moderation/escalation and applicable child-safety operations. |
| Reviewer access | **BLOCKED:** owner-approved reusable fake-data access/enrollment instructions. No master code/global trust/auth bypass. |
| Content rating/audience/store assets | **BLOCKED:** real IARC answers/category/age/countries/ads declarations, approved screenshots/artwork/developer identity and Play Console review. |
| Closed test setup | **BLOCKED:** developer account/eligibility, approved package/signing/upload, track/testers/actual opt-in links/feedback. Existing friends' sideload use remains informal testing. |
| Optional TWA tooling | **FAIL audit, not used by this Android build:** prior isolated Bubblewrap advisories remain. Do not migrate to that tooling to evade the blockers. |

## 5. Android lint results

**PASS —0 errors,42 warnings**; release vital lint passes. Baseline40: obsolete SDK23 check removed, three new Kotlin style suggestions, net+2. All warning categories and individual code locations reviewed in [lint review](PHASE_3_LINT_REVIEW.md) and [machine-readable inventory](phase3-lint-inventory.json). No suppression/baseline added. Remaining icons/resources/style suggestions do not constitute evidence of a crash or Play rejection; actual launcher visuals remain unverified.

## 6. Automated tests

| Check | Result |
|---|---|
| Root unit suite | **PASS:**72 tests,0fail, including data-only payload and invalid/transient token retirement regression. |
| TypeScript and ESLint | **PASS:** `npm run typecheck`, `npm run lint`. |
| Next production build | **PASS:** existing application production build, no architecture replacement. |
| Isolated `npm run test:item3` | **PASS:** authentication/CSRF, Google mocked OAuth, password/MFA, authorization, typing, deletion/media retention/report retry; new push two-device/logout/account-switch tests. Disposable loopback `item3_authorization_test`, fake data, no provider/mail calls. |
| Public/mobile web layouts | **PASS scoped:**6 public pages,18 layouts at320/390/1280px,11 internal links,0 broken links/browser errors; sitemap/robots/auth noindex checks. Not a full physical Android UI audit. |
| Native-style Settings UI | **PASS simulated port at360px:** no automatic permission request; explicit denial and missing backend configuration shown without a false success. This is not an Android bridge/dialog/provider run. |
| PWA offline | **PASS:** enforced CSP,360px touch, Retry/reconnect restores chat route and only public fallback cached. Does not certify native WebView offline handling. |
| Android Gradle | **PASS:** `testDebugUnitTest assembleDebug bundleRelease lintDebug`, offline final build successful. JUnit4pass:3 security/origin tests plus1 existing template arithmetic test. |
| Android artifact inspector | **PASS:** existing debug signature, package, nondebuggable unsigned AAB, bundletool structure, permissions/backup checks and static16KiB ZIP/native ELF alignment. |
| Physical/emulator/real FCM | **NOT VERIFIED:** ADB lists no device, no emulator run, no real provider messages or phone permission/refresh/tap tests. |

Build/debugging corrections are not hidden: an initial shell used the Android directory with root-relative patch paths, so those edits did not apply; the intermediate build lacked the new AndroidX dependency and failed. Corrected paths/dependency produced the passing offline builds. A first artifact inspection lacked per-process SDK environment variables; rerun with explicit SDK/JDK passed. The simulated native Settings test initially exposed a browser-permission-driven Android button label; separating the native label fixed it, and the denied-permission/missing-configuration tests then passed. It must not be mistaken for a phone test.

## 7. Android build outputs

Current artifacts stay ignored/local:

- `android/app/build/outputs/apk/debug/app-debug.apk`: verified existing **debug** certificate, locally installable test build, not a Play release.
- `android/app/build/outputs/bundle/release/app-release.aab`: bundletool validated, target36, nondebuggable, **unsigned**.
- [Exact hashes, sizes, public certificate and manifest evidence](phase3-build-evidence.json).

Reproduce from this existing worktree with `JAVA_HOME=C:\Users\mudas\jdk\jdk-21.0.2`, `ANDROID_HOME=C:\Users\mudas\android-sdk`, `CLIENT_URL=https://circlo.chat`:

```powershell
& android\gradlew.bat -p android :app:testDebugUnitTest :app:assembleDebug :app:bundleRelease :app:lintDebug --offline --no-daemon --max-workers=2
python scripts/inspect-android-build.py --apk android/app/build/outputs/apk/debug/app-debug.apk --aab android/app/build/outputs/bundle/release/app-release.aab --bundletool .freebuff/android-tools/bundletool-all-1.18.3.jar --output .freebuff/phase3-android-artifacts.json
```

No measured send/open latency or battery improvement is claimed from compilation. Provider work remains in existing post-response lifecycle; physical latency/reliability comparison remains NOT VERIFIED.

## 8. Required manual actions

Confirm permanent package/listing and monitored support contact; approve/configure the existing matching Firebase project and staged backend/migration; connect a test phone and run the [complete device checklist](PHASE_3_DEVICE_AND_CLOSED_TEST_CHECKLIST.md). Verify Google sign-in/session/key continuity, FCM lifecycle/preferences/taps and native offline/back/media. Confirm retention/moderation/child-safety/reviewer operations. Only then approve signing and Play actions.

## 9. Exact next steps for official closed testing

Follow the ordered [closed-testing gates](PHASE_3_DEVICE_AND_CLOSED_TEST_CHECKLIST.md): identity/account → approved staging configuration and real-device acceptance → contact/compliance/reviewer materials → approved upload key/final increasing version → verified signed AAB/Play App Signing → separately authorized track upload/pre-launch checks → actual opt-in link/testers → recorded testing/feedback and any applicable continuous testing period. Do not count sideload friends as official opt-ins or promise approval.

Source references: [target API policy](https://developer.android.com/google/play/requirements/target-sdk), [FCM lifecycle](https://firebase.google.com/docs/cloud-messaging/android/receive-messages), [AndroidX origin-scoped messaging](https://developer.android.com/reference/androidx/webkit/WebViewCompat), [Play testing](https://support.google.com/googleplay/android-developer/answer/14151465). No production action or credential publication is implied by these documents.

## Local commits and Git hygiene

- `ba28972`: session-bound registration/logout, privacy-safe transport/frontend and regression tests.
- `8898ec7`: existing Android origin-scoped bridge, native lifecycle/refresh and security tests.
- Release evidence/checklists are committed as a separate documentation phase.

Staged source scans and full Git history scan passed with the repository's existing reviewed exclusions; no exclusions were broadened. APK/AAB, build/tool caches, keys, credentials, local test logs and screenshots remain outside Git. The unrelated original checkout and original sideload APKs were not edited. Nothing was pushed or deployed. This scan does not certify that no credential has ever existed outside the scanned repository/history.
