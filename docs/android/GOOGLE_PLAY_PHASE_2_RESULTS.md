# Circlo Android release engineering — Phase 2 results

16 October 2026. **Local implementation and existing-project build work completed; Google Play closed-testing readiness remains BLOCKED.** No push, deployment, Play upload, purchase, production configuration change, new Android project, new signing key or final release signing occurred.

## 1. Executive summary

The owner confirmed an existing APK installed on a physical phone and shared with friends for real-time messaging tests. That is preserved as **informal user testing**, not dismissed or relabelled automated/official closed testing. Two matching APKs were found locally and inspected. They use the existing Gradle hosted-WebView/native-helper application, not TWA. The existing implementation was reused instead of generating another shell.

**Now ready locally:** a rebuilt, signature-verified debug APK; a format-validated, non-debuggable **unsigned** release AAB; conservative permissions; native origin/microphone/backup safeguards; public browser deletion/support pages; tested account deletion/reporting/blocking improvements; typing API regression coverage; signing/DAL procedures and Play materials.

**Not ready:** final package/signing approval, Play-uploadable signing, new-device/physical acceptance, native push integration, public monitored contact, production deletion/retention assurance, moderation/reviewer-access operations, live web/DAL deployment and Console declarations. Optional Bubblewrap still has unresolved tooling advisories. No Google Play approval guarantee is made.

## 2. Package identity and original APK evidence

| Check | Status | Evidence |
|---|---|---|
| Existing files identified | PASS | `D:\downloads\maddy chats\ziptalk-debug.apk` and `D:\downloads\maddy chats\android\app\build\outputs\apk\debug\app-debug.apk`, both19771284bytes |
| Same original artifact | PASS | SHA256 `26732c59f8de5097611e902d57d0a66b2942f0b6d172a20f6d7be714e61f305e` for both |
| Build identity | PASS | AGP debug output metadata and compiled manifest: `app.ziptalks.android`, version12/0.9.3, minSDK24, target/compile36 |
| Framework | PASS | APK MainActivity extends ComponentActivity; DEX contains `createHostedWebView`/WebView access and no TWA LauncherActivity. Capacitor asset configuration/plugins are present, but this activity is not a full Capacitor BridgeActivity |
| Original signing | PASS, debug only | APK Signature Schemev2 verification succeeded. Certificate subject Android Debug; SHA256 `b6768469e3c75b0403ebd1239085a0628105b55cdf2ad81afe3b7d72579648a4` |
| Original release suitability | FAIL | Debuggable/debug-signed, ZipTalk label, Vercel asset configuration/app link and broad permissions. An existing install does not make it a Play release |
| Exact file installed on friends' phones | NOT VERIFIED | User confirms installation/messaging, but device-side artifact hashes were not supplied and no ADB device is connected |
| Final package | BLOCKED | Owner explicitly chose to keep `chat.circlo.app` **proposed**, with no final signing. Existing `app.ziptalks.android` remains the local build identity to avoid an unnecessary migration |

Changing a debug certificate or package for a final Play release can prevent in-place updates. Keep a trusted old installation until the new installation is securely linked or a recovery backup verified. Never uninstall or clear encryption storage as a shortcut. A TWA would also use browser storage distinct from the existing WebView; migration requires deliberate enrollment, not copying keys or weakening trust. See [signing/DAL checklist](../../android-twa/SIGNING_AND_DAL.md).

## 3. Issues fixed and files modified

| Phase | Files / resulting behavior | Verification / local commit |
|---|---|---|
|A/B identity and DAL | `android-twa/identity.proposed.json`, `SIGNING_AND_DAL.md`; `src/lib/android-asset-links.ts`, `src/app/.well-known/assetlinks.json/route.ts`, `src/proxy.ts`, `tests/android-asset-links.test.ts` | Explicit validated public package/certificate config; disabled/malformed setup returns503/no-store. No placeholder/debug trust deployed. Unit/direct-handler tests and real local HTTP expired-cookie check. `a95a95f` |
|C public help/deletion | `src/app/support/page.tsx`, `delete-account/page.tsx`, `src/components/legal/help-page.tsx`, legal footer/privacy/public metadata/sitemap inventory; `src/lib/support-contact.ts` | Six public pages at320/390/1280px,18 layouts, no broken links or overflow, metadata/sitemap checked. Mail contact appears only after explicit valid configuration |
|C deletion | `src/app/api/privacy/delete-account/route.ts`, `src/server/privacy.ts`, `src/components/profile/account-data.tsx` | Both auth cookies expire; fresh-auth/CSRF/DELETE controls retained; new self-delete event details no longer retain actor UUID; claims now describe shared media/backups honestly |
|C reporting/blocking | `src/components/profile/report-dialog.tsx`, `src/lib/report-block.ts`, `tests/play-compliance.test.ts`, `scripts/test-play-compliance.mjs`/`.d.mts`, item3/public-page test runners | Failed block is explained, retry blocks without resubmitting report.320px actual UI test; API symmetric DM/call/typing block checks. C implementation commit `e41a9e6`; later typing/DAL acceptance additions in final evidence phase |
|D dependency remediation | Isolated TWA package/lockfile and `security-tests/uuid-compatibility.test.mjs`; dependency report | Scoped UUID11.1.1 override and real CJS consumer regression.13remaining entries, no suppression. `9dc5894` |
|Existing Android hardening/build | `android/app/build.gradle`, manifest, `MainActivity.kt`, `WebOriginPolicy.java`/JUnit test, strings, network/backup/extraction XML, `android/gradle.properties`, `capacitor.config.ts`, removed unused layout, `scripts/inspect-android-build.py` | Existing identity retained; canonical origin; exact-origin mic checks at both grant stages; external navigation outside WebView; third-party cookies/file access/mixed HTTP disabled; broad unused permissions removed; explicit backup exclusions; lint defects fixed. `b11a72c` |
|F/G evidence/materials | This results file, test matrix, Play worksheet and sanitized artifact metadata; TWA README updates | Separate evidence phase. No binaries/keys/credentials added to Git |

The active web/mobile interface and E2EE/message-send implementation were not rebuilt or weakened. Native Google handoff now requires the actual policy-acceptance flags and preserves MFA routing. Native Google account linking is not silently treated as login/account switching; use the browser's verified account-link flow. Actual Google credential/device behavior remains NOT VERIFIED.

## 4. Account deletion, privacy, UGC and support

**PASS locally:** public `/delete-account` links into existing web self-service without requiring Android installation; `/support` provides recovery/reporting/help paths; original email recovery remains required when a trusted device is lost. Sensitive deletion still requires the existing fresh-auth policy and explicit DELETE, never an anonymous account-ID request.

Disposable PostgreSQL/local-storage fixtures verified:

- Unauthorized deletion401, cross-origin403 and wrong confirmation422.
- Successful deletion expires access and refresh cookies; old access session is unusable.
- User, sent-message, device-session, OAuth binding and encryption-device rows are absent after deletion.
- Another member's message and shared attachment remain.
- Protected retention worker removes an aged, unreferenced owned file while retaining the shared file/inventory.
- Stale-auth/wrong-password rejection also passed the existing item1 security integration suite.
- A submitted report survives a simulated503 block failure; retry persists exactly one block and does not duplicate the report.

**NOT VERIFIED:** production cleanup scheduling, historical/untracked uploads, processor backups, all-device browser-encrypted drafts/caches, moderator operations and all group-owner-departure effects. These are not represented as complete deletion or full compliance. Other users' downloaded/decrypted copies cannot be erased remotely. Shared-group blocking does not remove membership or erase previous content.

**BLOCKED:** no monitored public support/deletion email has been confirmed. `PUBLIC_SUPPORT_EMAIL` is a server runtime setting containing an intentionally public contact, not a secret. No address was invented, inferred from admin credentials, configured in production or mailed. Public privacy/contact/retention text and Data Safety need owner operational sign-off. Dedicated group/status-content reporting and child-safety scope/staffing still require acceptance; existing APIs support user and visible-message reports, including group message authors.

## 5. Dependency security findings

See [all advisory IDs, dependency paths, versions, impact and remediation](DEPENDENCY_SECURITY_PHASE_2.md).

Original14 npm entries9 high/5 moderate map to five unique advisory IDs. UUID was upgraded through a narrowly scoped compatible override to11.1.1 and tested from Google client's actual CJS resolution context, including an undersized-buffer regression. **Remaining:13 entries,9 high/4 moderate.** Unpatched ZIP/signature issues and legacy image-parser dependency remain. The Bubblewrap guard still refuses CLI startup. No risk acceptance, forced obsolete downgrade or key/SDK download through Bubblewrap occurred.

The existing Gradle project does not ship or need that optional Node toolchain. Root production npm audit reports zero findings; that does not certify all Gradle/Android SDKs, E2EE or runtime behavior. Third-party native SDK security review remains NOT VERIFIED beyond the documented build/artifact checks.

## 6. Automated test results and reproducibility

| Command/check | Result |
|---|---|
| `npm run test:unit` | PASS:70 tests,0 failures |
| `npm run lint` | PASS, no ESLint warnings/errors |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, Next production build includes new routes |
| `npm --prefix android-twa test` | PASS:2 configuration tests |
| `npm --prefix android-twa run test:dependencies` | PASS:1 UUID compatibility/security regression |
| `npm run test:pwa-offline` | PASS:actual worker/offline HTML under enforced CSP,360px touch context; cache only public fallback |
| `npm run test:item1` with isolated loopback DB | PASS:fresh-auth/MFA/reset/password/security integration; no live mail/provider calls |
| `npm run test:item3` with isolated loopback DB | PASS:real production HTTP authorization, mocked Google OAuth, password UI,18public layouts, report/block UI, deletion/media retention and typing |
| Typing regression | PASS:auth, recipient targeting,5 s expiry, sender privacy opt-out, stop and block refusal. Real Android display NOT VERIFIED; no duplicate typing feature added |
| Existing Android Gradle `testDebugUnitTest assembleDebug bundleRelease lintDebug` | PASS:JUnit 1 test,0 failures; final build successful; Android lint0 errors/**40 warnings**, not warning-free |
| `scripts/inspect-android-build.py` | PASS:debug APK signature/package, AAB structure/manifest, target36, no broad library permissions, backup declarations/exclusions,16KB ZIP/ELF checks; explicitly unsigned AAB |
| Root `npm audit --omit=dev --audit-level=high` | PASS:0 findings |
| Optional Bubblewrap audit/guard | FAIL audit, expected STOP before loading CLI;9 high/4 moderate remain |
| Device/emulator execution | BLOCKED/no new physical or emulator run by agent. Owner's informal tests recorded separately |

Local integration DBs: `postgresql://item1_test@127.0.0.1:55799/item1_security_test` and `/item3_authorization_test`; fake accounts only. Provider responses are mocked or disabled. No production load test, paid API call or production account deletion occurred.

Development corrections are not concealed: the old item1 local fixture DB lacked newer schema columns and was recreated/migrated before a passing run; new test harness initially used an incorrect table name/HTTP method and was corrected before passing. Offline Gradle initially lacked cached dependencies; free official Maven dependencies were fetched, then the final offline build passed. Android lint initially found three real errors (unused missing-class layout, tracked SDK path syntax and unsafe Activity cast); they were fixed without a baseline/suppression.40 warnings remain, predominantly existing icon/resource/style warnings and deliberate JavaScript enablement for the hosted app. Backup-rule warning was addressed. Full test suites unrelated to this change were not all rerun; no claim of exhaustive physical, performance or penetration testing is made.

## 7. Android build artifacts and verification

Both new artifacts reuse `android/`, not a generated replacement. Current local test identity remains `app.ziptalks.android`, version12/0.9.3. Neither a new package nor a final release version has been approved.

| Artifact | Path / status |
|---|---|
| Existing original APK | `D:\downloads\maddy chats\ziptalk-debug.apk`; unchanged original file |
| Updated debug APK | `D:\downloads\maddy chats\.freebuff\device-release\android\app\build\outputs\apk\debug\app-debug.apk`; signed and verified with the **existing debug certificate**. Locally installable test artifact; not a Play release |
| Release AAB | `D:\downloads\maddy chats\.freebuff\device-release\android\app\build\outputs\bundle\release\app-release.aab`; bundletool format validation PASS, target36, non-debuggable, **unsigned**, not upload-ready |
| Machine-readable evidence | [android-build-evidence.json](android-build-evidence.json); hashes identify exactly the inspected files |

JDK `C:\Users\mudas\jdk\jdk-21.0.2`; SDK `C:\Users\mudas\android-sdk`; build-tools36.0.0. Official bundletool1.18.3 was downloaded from Google's GitHub release and SHA256 matched the release API digest `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`. It validated the bundle and dumped the actual manifest/config. ZIP signature entries and jarsigner output confirm the AAB is unsigned; a task called `signReleaseBundle` or exit0 alone is not proof of signing.

Rebuild from the existing `android` directory with those tool paths in `JAVA_HOME`/`ANDROID_HOME`, and `CLIENT_URL=https://circlo.chat`:

```powershell
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:bundleRelease :app:lintDebug --offline --no-daemon --max-workers=2
```

On a fresh machine, resolve reviewed official dependencies without `--offline` first. No production credentials are required. Do not pass signing parameters or regenerate keys. To repeat inspection from repository root:

```powershell
python scripts/inspect-android-build.py --apk android/app/build/outputs/apk/debug/app-debug.apk --aab android/app/build/outputs/bundle/release/app-release.aab --bundletool .freebuff/android-tools/bundletool-all-1.18.3.jar --output .freebuff/phase2-android-artifacts.json
```

The AAB's actual config requests PAGE_ALIGNMENT_16K and all inspected native LOAD segments meet16KB alignment. Real16KB device execution is still NOT VERIFIED. APK-only download size/runtime performance were not inferred from artifact size.

## 8. Digital Asset Links status

**PASS local preparation:** public route, validated explicit configuration and JSON/cache behavior; the local unauthenticated request with expired/invalid cookies returns503JSON when disabled, not a login redirect. Unit fixtures prove configured handler200JSON but do not prove certificate ownership.

**BLOCKED live trust:** no final app-signing certificate/package approval, no production endpoint/config changes, no installed-app ownership verification. Baseline production endpoint404 has not been deployed away. No debug fingerprint is published. WebView can function without TWA ownership verification, but verified app links and any later TWA need the correct real association. Local debug cert, upload cert and Play app-signing cert must not be confused.

## 9. Android acceptance and outstanding release blockers

See the [complete Android test matrix](ANDROID_TEST_MATRIX.md). The user's sideload tests remain informal evidence; they do not start Play's closed-testing period.

1. **BLOCKED:** final permanent package, final version and production signing approval. `chat.circlo.app` remains proposed; no new key created. Plan debug-to-production enrollment before removing trusted installations.
2. **FAIL integration readiness:** the active ComponentActivity creates a plain hosted WebView while frontend native-push code expects Capacitor plugin APIs. A full bridge/token registration/permission path is not established by that activity; the native FCM service's presence alone is insufficient. Repair and validate native notifications before calling messaging release-ready. No custom unaudited JS bridge was added merely to claim success.
3. **NOT VERIFIED:** native Google Credential Manager, Cloud package/cert registration, account linking/MFA/recovery, mic/file-picker changes, session/account switching and back/keyboard/rotation on actual phones. No device is currently attached; emulator is not installed. No test result was fabricated.
4. **NOT VERIFIED:** native offline UI; WebView skips the browser service worker, so the passing PWA offline test does not prove APK offline Retry.
5. **BLOCKED:** monitored public contact, accurate provider/backup retention, moderation and child-safety operations, complete report-target scope, and secure reusable reviewer access. Expiring6 digit codes cannot simply be pasted into Console. Never implement a global bypass or weaken encryption.
6. **BLOCKED:** approved web/DAL deployment and real association tests, Console declarations/rating/artwork/tester setup and any Play upload. No production changes permitted without approval.
7. **BLOCKED if TWA chosen:** remaining Bubblewrap advisories. Existing Gradle inspection avoided that separate toolchain without accepting its risks.

## 10. Developer actions and next steps before paying

Read the [Play Console worksheet](PLAY_CONSOLE_WORKSHEET.md) for draft title/descriptions, artwork checklist, Data Safety categories, UGC/child-safety scope, app-access instructions, tester recruitment/feedback and production-access preparation.

Before purchase/registration: confirm package/signing/migration; retain trusted installations/backups; connect an authorized phone for the updated APK matrix; resolve native notifications/Google/device acceptance; provide a real monitored support contact; verify deletion/retention/moderation and reusable review access; complete accurate declarations/assets. Then separately approve final signing, production web/DAL changes and Console actions. Friends' APK tests do not replace any required continuous closed-test opt-in period. No purchases or uploads occur automatically.

## 11. Git and change management

Completed phases were committed separately: A/B `a95a95f`; C `e41a9e6`; D `9dc5894`; existing Android hardening/build `b11a72c`; final acceptance additions/docs are a separate commit. Named files only were staged. APK/AAB/build caches, tool JAR, keystores, local config and credentials remain ignored. The unrelated root checkout and original APKs were not modified. No GitHub push, Render/Supabase change or message to testers occurred.

Final conclusion: **an updated debug APK exists for local testing and a valid unsigned AAB exists for release preparation. Circlo is not yet ready to begin official Google Play closed testing.** The remaining gates above require owner decisions, native integration work, actual device evidence and separately authorized external actions.
