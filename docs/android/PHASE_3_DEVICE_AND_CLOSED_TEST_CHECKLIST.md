# Physical acceptance and official closed testing

16 October 2026. Owner-reported installed APK/friends' messaging tests are **informal user testing**. This updated artifact has not been installed or exercised by the agent. `adb devices -l` currently lists no devices; no emulator is installed. Every physical row starts **NOT VERIFIED**. Record device model, Android/System WebView/Google Play Services versions, artifact hash, timestamp, network, expected/actual results and sanitized evidence.

## Updated APK acceptance

Use two disposable accounts and non-sensitive content. Preserve trusted installations/recovery backups. Install with `adb install -r <verified-debug-apk>` only after confirming package and debug signer continuity; do not uninstall/clear data to force an update. A final differently signed/package installation requires deliberate device enrollment and cannot inherit encryption keys automatically.

| Test | Expected behavior and required negative cases | Status |
|---|---|---|
| Launch, crash/ANR and back | Cold/warm/process-killed launch; branded existing mobile UI; keyboard/rotation/large fonts; back dismisses overlays or follows history without losing draft; root exit works | NOT VERIFIED |
| Login | Password/Google consent/MFA/device linking and email recovery; wrong credentials/expired codes fail; signed-out APIs stay denied | NOT VERIFIED |
| Session | Restart/update/overnight refresh retains valid account; logout and revoked/lost device cannot resume private access; switch accounts and ensure no prior data/notifications appear | NOT VERIFIED |
| Messaging/E2EE | Both directions, delivery/read receipts, queued sends, retries and old-message keys; no empty plaintext fallback or duplicate sends; missing key explains recovery | NOT VERIFIED |
| Group | Create on mobile, rename/photo/description update, authorizations, adding/removing member and key updates; removed member cannot read new content | NOT VERIFIED |
| Typing | Indicator appears/stops/expires; privacy opt-out suppresses; blocked user cannot trigger it | NOT VERIFIED |
| Microphone/voice | Grant/deny/permanent denial, record/cancel/play/retry, background/rotation; no camera or unrelated permission grant | NOT VERIFIED |
| Attachments | System picker, image/video/file, preview/caption,10MiB bounds/corrupt MIME, progress/error/retry, correct recipient decryption | NOT VERIFIED |
| Reconnect | Wi-Fi↔cellular, airplane mode/offline then resume, SSE catch-up and no duplicate/out-of-order send; native offline presentation tested separately from PWA worker | NOT VERIFIED |
| Delete/report/block | Actual mobile UI report and block retry, blocked DM/call, deliberate deletion with fresh auth, invalidated session; inspect staged object cleanup separately | NOT VERIFIED |
| Notification permission | No automatic prompt on login; explicit Settings Enable prompts Android13+; allow/deny/permanent denial/system disable all explained. Android12 and Android13+ both tested | NOT VERIFIED |
| Foreground notification | Message arrives through SSE without a duplicate OS alert while activity is visible; notification preferences/muted conversation respected | NOT VERIFIED |
| Background/closed activity | After authorized Firebase/backend setup, receive one generic notification on Home/swiped-away activity and cold process. Denied permission/DND/OEM battery restriction are distinguished from software faults | NOT VERIFIED |
| Notification tap | Warm and cold taps open exact chat/message; incoming-call route preserved; rejected malicious/foreign URL cannot run inside the WebView. Authentication and membership still gate access | NOT VERIFIED |
| Notification privacy | Lock screen contains generic Circlo text; no sender/body/keys in provider payload; switch/logout/revoke/delete and deliver queued event to ensure no former-account alert | NOT VERIFIED |
| Multiple devices/dedupe | Both approved phones receive their own notification; registering B does not unregister A; repeated event displays once; disable sound respects preference/channel | NOT VERIFIED |
| Token lifecycle | Controlled token invalidation/refresh without clearing E2EE storage; current token rebinds on resume; invalid server token retired. Bounded background refresh must be tested with valid/expired/revoked cookies and no connectivity; it must never cross accounts | NOT VERIFIED |
| Force stop/platform limits | OS force-stop may prevent delivery until reopened; no promise of unstoppable notifications or full-screen calling. Do not add battery-draining polling or bypass user settings | NOT VERIFIED |
|16KiB and Play splits | Run on an actual16KiB-page environment and Play-delivered installation; static alignment checks alone do not cover runtime compatibility | NOT VERIFIED |

Capture only filtered, sanitized crash evidence with tester consent; never commit cookies, FCM tokens, codes, private conversations or unfiltered phone logs. Measure the same device/network before/after for send, chat-open and status-open latency; no speed claim is made from compiling successfully.

## Closed testing gates — no submission authorized

1. **BLOCKED:** owner confirms existing/new Play listing and permanent package. Existing local `app.ziptalks.android`; proposed `chat.circlo.app` remains unapproved.
2. **BLOCKED:** developer registration/identity/account type/country/any required fee handled by owner, not purchased by agent.
3. **BLOCKED:** approved upload-key creation/backup, Google Play App Signing and final increasing versionCode. Verify signed AAB/cert/permissions/SDK; do not upload this unsigned bundle or debug APK.
4. **BLOCKED:** owner-approved Firebase configuration and staged database/backend/frontend deployment, then full physical matrix above. Close background-refresh and native offline acceptance gaps before claiming reliable release readiness.
5. **BLOCKED:** monitored public support/deletion contact and verified public privacy/support/deletion URLs on production. Local pages exist but do not imply deployment.
6. **BLOCKED:** confirm processor data, native Firebase metadata, retention/backups/cleanup schedules, Data Safety answers and encryption limits. Review actual artifact SDKs; privacy-first marketing is not a declaration exemption.
7. **BLOCKED:** secure reusable reviewer access using isolated fake-data accounts, working enrollment/MFA instructions and sufficient access to all reviewable features. Do not put credentials in Git, publish them or add a universal code/auth bypass. Ask Play support how to provide review access if normal enrollment cannot be made repeatable securely.
8. **BLOCKED:** confirm report/block UI scope, moderation staffing and escalation, applicable child-safety standards/contact, IARC rating, age/audience/category, ads/monetization declarations and countries.
9. **BLOCKED:** owner-approved store title/descriptions, current logo,512px icon/feature graphic, actual release phone screenshots without real personal data; no invented awards, audits or absolute encryption/metadata claims.
10. **BLOCKED:** after explicit authorization only, create the Console closed-testing track, upload the verified signed AAB, review automated pre-launch/crash warnings, choose tester list/Google Group and release countries, and obtain the actual Console opt-in/invitation link. Do not fabricate a link from the proposed package.
11. **NOT VERIFIED:** invite consenting testers through the owner (agent has not messaged anyone). Track opted-in dates and actual testing/feedback; sideloaded friends are not automatically opted in. Where applicable, Google's new-personal-account requirement is12 testers continuously opted in14days; confirm current Console eligibility and requirements before scheduling.
12. **BLOCKED:** appoint a monitored feedback channel, triage severity/reproduction steps, issue higher-version fixes, retain crash/ANR/device coverage and test history. Apply for production access separately if required; closed testing does not guarantee approval.

Primary references: [current target API policy](https://developer.android.com/google/play/requirements/target-sdk), [official testing eligibility](https://support.google.com/googleplay/android-developer/answer/14151465), [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [reviewer app access](https://support.google.com/googleplay/android-developer/answer/15748846), [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937).
