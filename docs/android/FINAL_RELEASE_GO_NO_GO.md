# Circlo 0.9.4 (13) — final release GO / NO-GO

**Decision: NO-GO for Google Play closed-testing submission. GO only for reviewing the prepared production rollout.**

16 October 2026, Asia/Dubai. Package **chat.circlo.app**, targetSDK36; existing signed identity/artifacts preserved. This review completely read `FINAL_PLAY_COMPLIANCE_CHECKLIST.md` and `SIGNED_RELEASE_RESULTS.md`, inspected the source and existing release implementation, rechecked live public URLs, queried the owner-approved Render workspace read-only, and reverified signed artifacts. No Android rebuild, new signature/key, push, deployment, production migration, Firebase change, Play upload/publication or purchase occurred.

Status definitions: PASS = scoped evidence; FAIL = observed unmet requirement; BLOCKED = prerequisite/owner action absent; NOT VERIFIED = evidence unavailable. A local PASS does not override a live FAIL or a device/operational evidence gap.

## 1. Blocker register

| Blocker / requirement | Current status and evidence | Required action | Deployment needed? | Developer approval/input needed? |
|---|---|---|---|---|
| Live support page | **FAIL:** two fresh unauthenticated HTTPS requests to `/support` returned404. Local route exists since `e41a9e6`; local direct navigation/refresh returns200 | Deploy prepared web code, repeat real-host incognito navigation/refresh and contact/link checks | Yes, existing Render service | Yes, push/merge/deploy |
| Live external deletion page | **FAIL:** two unauthenticated requests to `/delete-account` returned404; local direct navigation/refresh returns200 without sign-in | Deploy, verify public page and real browser login return path; submit only the working live URL | Yes | Yes |
| Deletion CTA opens usable settings | **PASS locally after actual fix:** `#account-data` previously pointed inside a lazy collapsed section whose anchors excluded that ID. Fixed in `1a1c1fa`; actual UI direct navigation/refresh now exposes Delete my account without issuing a deletion request | Deploy fix; repeat on actual host and Android | Yes | Yes |
| Backend account deletion security | **PASS disposable local DB:** unauthenticated401, cross-origin403, wrong confirmation422, fresh-auth controls, expired cookies/session invalidation, database cascades and orphan/shared-media checks. **NOT VERIFIED production** | After approval use a designated disposable account, not a real user/admin account; verify protected mutation and actual cleanup schedule/retention | Yes for pending cleanup/cookie refinements; live test afterward | Yes to deployment and any designated production deletion test |
| Public monitored contact | **Owner confirmed:** `mudassarmalak090@gmail.com`. Local pages render it when `PUBLIC_SUPPORT_EMAIL` is set. No real mail sent | Set approved server runtime value and verify deployed mailto links; owner monitors mailbox and Console contact | Yes, runtime configuration/restart | Input supplied; production configuration still needs approval |
| Native notification backend | **BLOCKED live:** production remains `ca68422`, before session-bound protocol. Local two-device/logout/account-switch/auth tests pass | Apply migration0049 and deploy Phase3 frontend/backend together before new APK distribution is treated as supported | Yes, DB + existing web service | Yes |
| Production migration/credentials | **NOT VERIFIED** actual live ledger, DDL rights, admin credential consistency and cleanup execution. Source diff has one new migration0049 | Complete read-only DB preflight/backup/lock assessment, preserve existing credentials and apply exact journaled migration | Yes for migration | Yes; no production DB query or mutation performed here |
| Firebase Android configuration | **PASS static:** supplied matching client and signed compiled resources use `chat.circlo.app` / `ziptalks-5b402`. Real FCM transport **NOT VERIFIED** | Confirm backend Firebase Admin project/service-account setup and run physical lifecycle tests | Backend configuration may need update; not an APK rebuild by default | Yes to any external configuration change |
| Google sign-in for new package | **NOT VERIFIED:** live native-client metadata GET200 exposes configured web OAuth client. Its project-number prefix is880623090962; Firebase messaging project is363077018811. Supplied Android config lists no OAuth clients | Register/verify Android package + upload SHA1 in the Cloud project of the actual web OAuth client; later register Play signer there too; test Credential Manager end-to-end | Usually external Google configuration; backend only if deliberately changing web client | Yes, external config; no client ID/secret change made |
| Signed AAB/APK identity | **PASS:** unchanged hashes, correct package13/0.9.4/SDK36, valid signatures, exact upload certificate, nondebuggable manifest/permission checks | Retain artifacts; upload only after all remaining gates and separate approval | No | Upload approval still required |
| Android notifications/media/session acceptance | **NOT VERIFIED physically:** ADB has no connected device; automated/simulated tests are not a phone run | Execute section5 on actual updated signed and eventually Play-delivered installations | Requires compatible backend first | Device access/consent; approval for any production test actions |
| Signing-key recovery | **FAIL readiness / owner confirms no independent backup:** known release directory has only original PKCS12 and Windows-bound DPAPI password; restrictive ACL verified | Owner makes offline encrypted backup and independently stores password; verify restored signer and new-computer recovery per section6 | No | Owner-selected offline destination and private backup action; no cloud upload |
| Play App Signing / installed signer | **BLOCKED Console action:** upload signer known, Play app-signing certificate not available | Enroll/verify in Console, retain public app-signing cert, register it for OAuth/app links | DAL publication only after actual signer is known and approved | Yes, Console/trust changes |
| Privacy/Data Safety/retention | **BLOCKED operational sign-off:** public privacy200; provider retention, historical files/backups and final Console answers not independently verified | Owner validates actual data inventory/lifecycle and submits accurate declarations; do not declare no-data solely because chats use E2EE | Policy/contact revisions if needed; runtime cleanup verification | Owner answers and approval |
| UGC/moderation/child safety | **PASS local report/block tests; NOT VERIFIED staffing and full group/status handling** | Verify operational moderation/escalation, applicable child-safety standards/contact and Android report/block UX | Only if verified missing code/policy requires it; not invented here | Owner operational input and any changes |
| Reviewer login access | **BLOCKED:** no approved reusable review accounts/enrollment procedure verified | Isolated fake-data credentials and repeatable access instructions in Console only; resolve expiring-device-code access with Play guidance, not a universal bypass | No planned auth bypass or production code change | Owner credentials/access plan |
| Content rating/listing/closed-track setup | **BLOCKED:** actual Console/account type/setup not inspected; no IARC answers, approved final screenshots or actual opt-in URL verified | Complete section7 accurately, separately authorize upload/track rollout, collect real tester opt-in/feedback evidence | No website deployment unless policy issues require it | Yes; owner declarations, Console actions, any fee |
| Verified HTTPS app links | **FAIL existing live DAL404; NOT VERIFIED Play signer:** not TWA; basic hosted WebView launch does not require a TWA migration | Publish only approved real package/app-signing certificate association if verified links are to be enabled; test installed signer | Yes for DAL environment config | Yes, trust/publication; no debug trust |

## 2. Proven cause of the live404s and prepared fix

- Live `GET /api/app-version` twice reports `ca68422a7d6552d1557a65cb117104d7d5cf9abc`; remote main also points there.
- Owner approved read-only Render workspace `tea-d3ir0qh5pdvs7395u2j0`. Existing service **circlo**, `srv-darbkvu7bikc738b21j0`, has live deploy `dep-db8pcbdbedkc73f3buh0` at exactly that commit. Repository `mudassirishfaq94/maddychats`, branch main, Node runtime, root directory empty; build `npm ci && APP_VERSION=$RENDER_GIT_COMMIT npm run build`, start `npm start`.
- Support/deletion routes were added later in local commit `e41a9e6`. They were never pushed/deployed. This is an older deployed source revision, not evidence of a broken Next route convention or a cached404 needing a rewrite.
- Real unauthenticated requests: `/support`404 twice, `/delete-account`404 twice, `/privacy`200 twice. Repeated read-only requests used no session and requested no-cache; no private production data was accessed.
- Prepared local routes: `src/app/support/page.tsx`, `src/app/delete-account/page.tsx`, shared help/footer/public metadata; `src/app/api/privacy/delete-account/route.ts` → `src/server/privacy.ts` is the actual protected deletion path. The public page itself never deletes data anonymously or via GET.
- Additional actual bug fixed: `src/app/app/profile/page.tsx` now includes `account-data` in the Privacy & your data disclosure anchors; public instructions now use that real section name. Test in `scripts/test-play-compliance.mjs` checks direct navigation and reload with zero deletion requests.

**Only local functional completion is claimed. Live requirements remain FAIL until an approved rollout and live retest.**

## 3. Production deployment prepared for approval — NOT EXECUTED

### Scope and exact service

Deploy the reviewed release branch `codex/device-recovery-20261013`, including code fix `1a1c1fa80727e4bda834805853f069923ca440f7` and the already committed Phase2/3 changes, into the existing main-backed service above. Freeze and review the final candidate commit before approval; do not change signed Android identity/artifacts. This is an existing Node-service update, not a new Blueprint, duplicate service, database or paid plan.

**Important observed behavior:** Render has `autoDeployTrigger=checksPass` on main. An approved merge/push to main can trigger deployment automatically. Approval must cover the coordinated push/merge, migration, environment changes and deployment; this task performs none of them. Do not apply the old reference `render.yaml` wholesale: it still contains a historic branch/Render-origin configuration that differs from the verified live service.

| Area / files | Pending production behavior |
|---|---|
| Public routes/help/legal/public metadata/proxy | `/support`, `/delete-account`, help links, truthful retention copy; public DAL handler remains disabled without explicit valid trust config |
| Profile/deletion | `src/app/app/profile/page.tsx`, account-data UI, deletion page, `api/privacy/delete-account`, `server/privacy`: reachable confirmation UI, both cookies expired, account audit/data handling refinements |
| Reporting | report dialog and `report-block.ts`: block failures explained, retry does not duplicate report |
| Notifications | `api/push/register`, auth/logout, schema, native bridge/payload/delivery helpers, preferences/provider, `server/web-push`: session-scoped registration/cleanup, data-only generic native payload and secure account switching |
| Database | `drizzle/0049_fcm_session_binding.sql` and journal: nullable `fcm_tokens.session_id` FK → device_sessions with cascade. Only new migration in source diff from live commit |
| Operator/test material | `.env.example` documents approved public mailbox setting and reuse of existing Firebase project; deployment tests/docs are local review material |
| Android/signing/tooling | Not deployed as a web rebuild/migration of Android. Signed release stays13/0.9.4; signing files and binaries stay outside Git. Firebase client JSON stays ignored/local |

### Required configuration — names only for secrets

| Setting | Prepared requirement |
|---|---|
| `PUBLIC_SUPPORT_EMAIL` | New/confirmed runtime public value `mudassarmalak090@gmail.com`; explicitly owner-approved, not inferred. No actual environment change made |
| `CLIENT_URL`, `GOOGLE_CALLBACK_URL` | Verify canonical `https://circlo.chat` and `https://circlo.chat/api/auth/google/callback`; capture current configuration before any approved change |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Preserve existing authorized web OAuth credentials. Native metadata confirms a configured web client, not Android package/cert acceptance. Register Android clients in its actual Cloud project |
| `FIREBASE_PROJECT_ID` | Verify backend value `ziptalks-5b402` for this FCM setup; actual host environment not exposed by the read-only service tool and not independently verified |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Existing appropriate service-account secrets from that messaging project; server-only host secrets, never `NEXT_PUBLIC_*`, Android resources or Git. Do not regenerate/rotate just for this release without a reason/approval |
| `DATABASE_URL`, `REALTIME_DATABASE_URL`, `MIGRATION_DATABASE_URL` | Verify actual target DB and migration ledger read-only first; use existing separately authorized DDL connection for migrations, limited runtime role for serving. Never broaden application role just to make migration succeed |
| `JWT_SECRET` | Preserve current secret/session continuity; no unnecessary rotation |
| `RESEND_API_KEY`, `EMAIL_FROM` or name/address pair, optional `EMAIL_REPLY_TO` | Verify existing approved sender and reset/recovery delivery; no real email/API delivery run in this task |
| Existing storage/media settings | Preserve `SUPABASE_URL`, server-role key, bucket and current media/scanner settings. No storage-provider/account/bucket change or paid provisioning |
| Existing VAPID settings | Preserve public/private VAPID keys and subject; browser Web Push is separate from native FCM. Rotating keys would invalidate subscriptions |
| `CRON_SECRET`, existing maintenance/worker settings | Verify protected cleanup runs and failures retry. Starter maintenance calls cleanup at startup and15-minute intervals while running; sleeping/free instances are not a wall-clock deletion SLA |
| `CSP_ENFORCE`, existing security settings | Preserve enforced policy; do not relax auth, device trust, CORS or encryption |
| `TWA_DAL_ENABLED`, package/certificate settings | Remain disabled/unmodified until the actual installed/Play signer and trust change are approved. Never publish placeholder/debug certificate association |

Production secret presence, validity, IAM rights and current DB migration ledger remain NOT VERIFIED; no secret values were printed/read from Render and no production SQL was executed.

### Migration and rollout order

1. Owner approves the frozen candidate and exact existing service scope, public mailbox, current configuration capture, DB preflight/backup and verification test accounts. Verify a restorable protected DB backup/PITR and storage lifecycle before changes; no production dump/backup was made by this task.
2. Before any main merge, inspect the live Drizzle ledger and `fcm_tokens`/`device_sessions` schema using an authorized read-only DB session. Compare actual migration hashes/order to the checked-in journal. Confirm0049 is pending or already exactly applied. Do not run raw ALTER independently and leave the ledger inconsistent.
3. Assess table size, locks and DDL credentials; rehearse on staging with bounded lock/statement timeouts supported by the selected connection. The migration adds a nullable column/FK but still takes a table lock and may validate existing rows. Do not promise nonblocking DDL without evidence.
4. With explicit approval, run the existing `npm run db:migrate` against the separately authorized migration connection, preserving journal order. The only new source migration is0049; stop for unknown/mismatched earlier entries. No backfill auto-trusts legacy tokens; they remain ineligible until authenticated re-registration.
5. Apply only approved runtime values to the existing service, preserving all unrelated secrets/settings. Push/review/merge the candidate with approval, accounting for automatic checksPass deployment. Existing `npm start` runs journaled migrations again before serving; it should see0049 already applied, not execute a second manual ALTER.
6. Build with the existing Node command and `APP_VERSION=$RENDER_GIT_COMMIT`; start with `npm start`. Confirm runtime-role grants still work, health checks pass and actual `/api/app-version` is the approved revision.
7. Execute the live tests below before distributing the new APK as supported. No new native key or package/version change is involved in this web rollout.

**Expected downtime:** not measured. Historical live build took approximately160seconds, which is not a downtime measurement. Plan an operator-observed window of several minutes; migration lock duration, free-instance replacement/cold start and SSE reconnect can interrupt users. Do not promise zero downtime. Keep existing traffic checks and abort on migration/health/auth failures.

### Rollback

- Record current live deploy `dep-db8pcbdbedkc73f3buh0` / `ca68422` and current runtime configuration before rollout. Obtain rollback approval with deployment approval.
- Prefer application rollback while **retaining additive migration0049**. Old code ignores the nullable column. Do not delete the migration ledger entry or drop the column under a running new application.
- Old code has the legacy native-notification protocol. Freeze new APK distribution; if application rollback is necessary, use an explicitly approved temporary FCM disable in a restarted process rather than mixing old plaintext/auto-presentation sender behavior with the new native protocol. This affects alerts, not message encryption; never introduce plaintext message fallback.
- Restore only captured settings changed by this rollout. Never rotate JWT/VAPID keys, reset device trust or replace signing keys as a rollback shortcut.
- A schema undo, if ever needed, requires a separately reviewed compensating migration after all readers are rolled back. Do not execute the comment-only DROP rollback or modify ledger history ad hoc.
- Account deletion and storage erasure are not undone by rolling back application code. A DB-wide restore can discard unrelated users' new activity and is not routine rollback. Use designated fake accounts for approved destructive verification.

### Post-deployment verification — required for closing live blockers

- Fresh incognito Android and desktop: direct `/support` and `/delete-account`, refresh each, expect200 HTML and no authentication redirect; verify approved email links, privacy/terms/support/deletion navigation and final canonical host.
- Follow deletion CTA to normal login/enrollment; return to `/app/profile#account-data`, verify section opens after direct navigation/reload. Opening a link must not mutate the account.
- With an explicitly approved disposable account, verify unauthenticated/CSRF/wrong-confirmation/wrong-fresh-auth rejection, then deliberate successful deletion, expired cookies and stale-session refusal. Verify own tracked object cleanup and shared-recipient preservation through authorized operational checks; do not claim all backups are instantly erased.
- Check health/version, login/password/MFA/device recovery, message send/decrypt/realtime reconnect, report/block and storage. Do not exercise real paid email/payment APIs automatically.
- Register two approved phones, log out one/switch account, check token ownership and revoked-session exclusion; verify generic FCM payload/channel preferences and native tap routes. Real provider and physical results must be recorded separately.
- Observe errors/locks/latency using redacted logs. Do not put tokens, credentials, private message content or complete phone logs into the evidence repository.

## 4. Existing signed release verification

Both existing artifact hashes still exactly match `signed-release-build-evidence.json`. AAB signature, certificate equality, bundletool format, package/version/target/nondebuggable/network/permissions and16KiB native alignment reverified using `scripts/verify-signed-android-release.py`. APK v2/v3 signature and upload certificate reverified with official apksigner. No artifacts were modified or resigned.

Upload SHA256: `A1:FD:A8:79:F4:FF:03:03:5D:27:BA:94:1A:7D:4F:3D:EC:04:08:97:C6:1F:AA:20:55:29:B1:09:07:A0:99:BF`.

Signed manifest includes Internet/network, RECORD_AUDIO, POST_NOTIFICATIONS, vibration/wake, FCM receive and the signature-only receiver permission. No broad photo/video/storage/camera/full-screen/boot/biometric permission was introduced. Static POST_NOTIFICATIONS declaration is not proof of the Android13+ runtime permission or real background delivery. Actual Google client registration, permission prompts, delivery, microphone and media behavior remain device-test gates.

The separate messaging and OAuth projects are not automatically a defect. The server native client endpoint currently supplies a web OAuth client from project-number prefix880623090962; Android Credential Manager registration must correspond to that web client's Cloud project. The supplied Firebase client has zero OAuth entries; it does not prove Cloud registration exists or fails. Do not replace the working web client/secret or conflate FCM project configuration with Google login verification.

## 5. Real-device acceptance procedure

Use the preserved artifact hashes, two fake accounts, Android13+ and preferably an older supported device, Wi-Fi and cellular. Record model/Android/WebView/Play Services/version/hash/time/network and sanitized expected/actual evidence. ADB currently lists no connected device; no physical PASS is claimed. Existing friends' old-APK tests remain informal history.

1. Retain a trusted old installation/recovery backup. New package is a separate installation. Test the upload-signed APK first only with a compatible approved backend; later test the Play-delivered build signed by Play. Different upload/Play signers can prevent in-place updates; do not erase keys/storage to work around this.
2. Cold/warm start, login by password and Google, consent cancel/deny, wrong credentials, MFA, new-device linking and lost-device recovery. Restart/kill process and verify correct session/account. Confirm the Google package/upload cert and later Play cert both work without developer-error screens.
3. Two accounts send/receive encrypted messages; verify delivery/read status, typing privacy, group messaging, old-key recovery, airplane-mode queue and Wi-Fi↔cellular catch-up without duplicates/plaintext fallback.
4. Enable notifications only through Settings. Test grant/deny/permanent denial/system settings, visible app quiet, Home background, swiped-away activity and cold process; distinguish force-stop/DND/OEM restrictions. Test sound/muted chat/disabled preferences, repeated events, refresh, logout and account switching with no old-account alert.
5. Tap warm/cold message notifications into the correct conversation/message and preserved call route; authentication/membership gates remain. Reject foreign URLs. No full-screen/unstoppable ringing guarantee.
6. Pick valid image/video/file, preview/caption/send/decrypt/download, reject corrupt/oversized inputs, interrupt/retry upload. Grant/deny mic, record/cancel/play voice and audio call; verify foreground/background/rotation/headset behavior without unwanted permission grants.
7. Exercise mobile settings/deletion anchors, keyboard/back/overlays/large fonts/rotation/native offline Retry. With approved fake account only, complete fresh-auth deletion and verify session/token revocation and operational cleanup. Capture crash/ANR and latency evidence, not merely installation success.

The detailed prior `PHASE_3_DEVICE_AND_CLOSED_TEST_CHECKLIST.md` remains the recording matrix. None of these physical steps was executed by the agent in this task.

## 6. Signing backup and restoring on another computer

**BLOCKED:** owner says no offline backup/independently saved password. Read-only inspection of `%USERPROFILE%\CircloRelease` found original `signing\circlo-upload.p12` and `upload-password.dpapi`, not a second recovery copy. Signing directory ACL is owner/SYSTEM only. No private material/password was printed and no cloud upload/copy was initiated.

Owner action, in a private local session:

1. Select an offline owner-controlled destination, outside Git and cloud-synced folders. Save the keystore password independently in a password manager; do not paste it here. The existing DPAPI password file is bound to the current Windows profile, not a portable password backup.
2. Make two encrypted offline copies of the already password-encrypted PKCS12 and public certificate/release record, in separate controlled locations. Verify copy hashes and open a restored copy with JDK keytool privately. No replacement key generation.
3. On another trusted computer, install the reviewed JDK/Android tools, create an owner-only signing directory outside all checkouts, restore a copy of `circlo-upload.p12` and the public certificate. Obtain its password from the independent password manager, not the old DPAPI file.
4. Run `keytool -list -v -keystore <restored-file> -alias circlo-upload` interactively; verify PrivateKeyEntry and exact SHA256 above. Never put the password directly in arguments/reports.
5. If using the Windows signing helper, privately create a **new-machine** DPAPI password file using `Read-Host -AsSecureString` and `ConvertFrom-SecureString` in that protected directory. Do not rerun the key-generation helper over restored material. On other OSes use the platform's secret store/interactive signing tools, preserving the same key/alias.
6. Sign a local nonproduction verification copy and verify its signer against the public cert. Record only public fingerprint, test result and backup location class. A restored same-machine copy alone does not establish cross-computer/password recovery.

These backup/restore actions were documented, not falsely marked executed. Until owner supplies a backup destination and independent password recovery is verified, signing recovery remains a release blocker.

## 7. Play Console instructions — not executed

1. Confirm developer identity/account type/country and authorized access. Any registration fee needs separate approval; no purchase made.
2. Create the Circlo app with actual language, app category and free/paid model. Read declarations rather than inventing answers. The first bundle binds the package: inspect **chat.circlo.app**,13/0.9.4 before accepting upload; Console must not already have an equal/higher code.
3. Enroll/verify Google Play App Signing. Keep the upload key private; record the separate Play app-signing public SHA1/SHA256 and use that installed-app cert for Google OAuth and approved App Links/DAL. Do not publish upload/debug trust as a substitute.
4. After explicit upload approval and closed gates, use the existing signed AAB, not a debug APK; review Console validation, permissions/SDK notices, pre-launch/crash/ANR findings and Play-delivered split behavior.
5. Set privacy policy to `https://circlo.chat/privacy`; after live200 verification set account deletion to `https://circlo.chat/delete-account`. Public pages must work without installed app/login; the actual deletion action still verifies ownership. Set approved contact `mudassarmalak090@gmail.com` consistently with owner consent.
6. Complete Data Safety from actual backend/native SDK behavior: identifiers/email/optional phone, device/session/push metadata, readable profile/group/status content, diagnostics and explicitly submitted reports; review narrowly unreadable E2EE contents separately. Do not declare no collection/sharing just because chats are encrypted. Confirm processor/retention/backups and policy accuracy with owner.
7. Complete IARC rating, target audience, UGC/user interaction/media, ads/monetization, countries, moderation and applicable child-safety requirements honestly. No rating/category answer is invented here. Provide real screenshots/assets from the tested release with fake data.
8. In App access, supply maintained isolated fake-data reviewer credentials and complete repeatable Google/password/device-enrollment/MFA instructions through Console only. Review must not depend on the owner being online to issue an expired6-digit code. Resolve secure review access before submission; do not add a master code or bypass trust/encryption.
9. Create the closed-testing track, consenting tester list/Google Group and actual release/countries only after approval. Obtain the actual Console opt-in URL, then owner invites testers; no guessed link or automated external messages. Testers opt in using their listed Google account and install the Play build.
10. Keep real opt-in/activity/device/feedback/fix evidence. If the account is subject to the new-personal-account rule,12 continuously opted-in testers for14days is a **later production-access condition**, not a completed result or a prerequisite elapsed period before creating this closed test. Check the account's actual Console requirements. Production application/upload/publication remains a separate decision; approval is not guaranteed.

Primary references rechecked: [app signing](https://developer.android.com/studio/publish/app-signing), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469), [testing eligibility](https://support.google.com/googleplay/android-developer/answer/14151465). Operational/Console answers remain owner supplied, not inferred from policy text.

## 8. Evidence from this task and stop point

- PASS production Next build and ESLint.
- PASS disposable local `npm run test:item3`: authentication/CSRF/OAuth mocks/password/MFA, native-token lifecycle, typing, report/block, protected deletion/session/media cleanup plus the new deletion direct-link/reload regression. Test DB is loopback `item3_authorization_test`, fake data only, no real mail/FCM calls.
- PASS6public pages/18layouts/11internal links/0broken links or browser errors in that integration; separately PASS360px anonymous support/deletion direct navigation + refresh + approved mailto rendering + correct login return target under the production standalone server.
- PASS existing AAB/APK signature/identity checks and exact unchanged hashes; no Android build or signing executed.
- FAIL live support/deletion URLs; read-only Render deployment metadata and app-version establish old deployed revision.
- BLOCKED offline signing recovery and real-device/Google/FCM/Console/operational sign-off. No physical result fabricated.
- Read-only live checks and redacted service metadata were used; no production SQL, secrets retrieval or destructive account test was performed.

**Stop point:** the production rollout above is prepared for developer approval. Do not push/merge, set production environment values, apply migration0049 or trigger a deployment until that exact scope is approved. After deployment, reverify live requirements and close every remaining blocker before changing this decision to GO.
