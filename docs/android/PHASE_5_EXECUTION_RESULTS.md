# Phase 5 execution results

16 October 2026 (Asia/Dubai). **NO-GO for deployment / closed testing.** This supersedes earlier access/backup blockers only where fresh evidence below says so. Implemented, deployed and physically tested are separate statuses.

## Implemented and verified

- Fixed Windows ACLs on10existing local backup-directory/file entries. Only owner, SYSTEM and Administrators retain access;0unexpected entries. No archive deleted or overwritten. New recovery storage is outside Git with restricted ACLs.
- Installed official Render CLI2.29.0 outside Git; GitHub asset SHA256 verified. Owner completed authentication; actual env-vars GET now succeeds. Earlier failure was HTTP401, not a proven wrong-service error.
- Updated `scripts/database-backup.mjs` to record policy-role dependencies and reject missing destination roles before restoration. No automatic role creation/grants or weakened RLS. Verified backup/manifest on a fake local DB, rejection of a deliberately missing role and successful restore into a separate empty local DB; test DB removed.
- Added `scripts/verify-migration-ledger.mjs`: offline-only checksum/timestamp comparison, differentiates line endings from content changes, supports an explicitly supplied historical SQL directory. It never connects to or edits a database.
- Existing support/deletion routes, settings anchor, session-bound native token code and Android configuration already exist in the release candidate; no duplicate rewrite.

## Production access/configuration established â€” read-only

At15:15:54â€“15:19:30UTC, verified existing Render service circlo/srv-darbkvu7bikc738b21j0, main, auto-deploy checksPass. Actual DB is **Neon PostgreSQL18.6**, target fingerprint0c0f36b8a9b64def. Runtime/realtime/migration URLs resolve to the same intended target. Inspection transaction confirmed READ ONLY.

Present: database/runtime/migration connections, JWT, canonical CLIENT_URL/Google callback, Google web credentials, Supabase URL/server key/bucket, VAPID settings, Resend/sender, CRON_SECRET and CSP_ENFORCE. Presence is not end-to-end provider authorization. Supabase bucket metadata read succeeded and bucket is private.

**Missing:** FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY and PUBLIC_SUPPORT_EMAIL. These were not configured by the agent. Existing matching Android Firebase client cannot replace server credentials. Canonical Google URLs match circlo.chat; native package/certificate acceptance still needs actual Google/device evidence.

## Fresh encrypted backup and isolated restoration â€” PASS with limits

Fresh logical snapshot started **2026-10-16T15:18:56Z**, completed **15:20:01Z**,717,962bytes. SHA256 `73b3c3f6c2657a78bc54c5d428fec223b1d43689247cb0cb21495ab34cf1f1de`.

Stored under `C:\Users\mudas\CircloRelease\recovery-20261016-151856`: current.dump.enc, encryption.json, current.dump.json and key.tmp.dpapi. AES-256-GCM authentication and recovered plaintext checksum verified. Decryption used the DPAPI-protected key; temporary recovery-folder plaintext dumps were removed after successful restoration. DPAPI requires this Windows identity/profile: independent cross-computer recovery is **not verified**. Do not lose the key file/profile or assume it is a portable backup. No cloud upload.

Successful isolated restore completed **15:22:57UTC**:50tables, all archive COPY row counts match,84FK checks,0dangling references,0unvalidated FKs,0invalid indexes.161indexes/2sequences restored, pg_trgm1.6/plpgsql1.0 available. Actual restore1.23seconds; local setup+checks6.99seconds, **not production RTO**. Cluster stopped. Sanitized aggregate evidence is `PHASE_5_RECOVERY_EVIDENCE.json`.

First runtime-role dump attempt failed and left only a protected partial; successful dump used the separately configured authorized migration/owner connection to the same verified target. No privileges changed. A restore attempt exposed the missing policy role; the isolated cluster then used a reviewed NOLOGIN/NOSUPERUSER circlo_runtime role. An initial harness mistakenly selected the old archive; its hash did not match the fresh archive, so that evidence was discarded and a source-hash guard added. The successful current result above uses the fresh checksum and50tables, not the historical38-table result.

Coverage is public/drizzle, not cluster roles/ACLs, other schemas, provider settings, browser private keys or Supabase object bytes. Current source schema inventory contains public/drizzle plus system schemas. Provider PITR/window and portable/offline encryption-key recovery remain unverified. Fresh archive fidelity is verified; independent source count equality at the same exported snapshot was not measured. Private stopped restore copies remain owner-only for controlled retention; do not commit/sync them.

## Migration state â€” do not execute

Production49ledger entries vs51candidate journal entries:

-0049_fcm_session_binding is **pending**, and fcm_tokens.session_id is absent as expected.
-0042_private_application_tables has **no ledger entry** although later migrations are recorded. Read-only inspection at15:28:11UTC checked38existing in-scope tables:12lack RLS (admin_audit_log, channels, communities, community_members, device_link_requests, email_verification_tokens, group_invite_links, login_history, privacy_settings, rate_limit_buckets, reports, scheduled_messages). None of the38had PUBLIC/anon/authenticated table grants. This is incomplete intended hardening, not evidence of observed public data exposure. A reviewed forward repair must preserve least-privilege runtime policies/append-only audit access before enabling RLS and pass tests with the actual runtime role. Reconcile the missing historical ledger entry without inventing a prior execution record; never insert a fabricated ledger row or rerun all migrations blindly.
-0033_account_security initially appeared mismatched. Exact production checksum matches the original checkout's saved SQL; LF-normalized content equals the release copy. Mixed line endings explain it; no content drift is asserted. All other recorded entries match source raw/LF-equivalent hashes. No unknown timestamps or duplicate timestamps found.

Read-only snapshot: fcm_tokens64KB/estimated0live rows, device_sessions112KB/estimated39live rows; no relevant locks or other open transactions observed. These are small tables, not proof of future contention.0049 expects ACCESS EXCLUSIVE child lock and SHARE ROW EXCLUSIVE parent lock through transaction commit. Start with1s lock/10s statement limits only on verified migration connections after staging rehearsal; never global settings or automatic repeated retries. New code requires column first; old explicit-column queries tolerate it. Legacy native registration must re-enroll securely; no token auto-binding.

## Deployment and live website â€” NOT DEPLOYED

No Git push, production environment change, migration, deploy, publication or spending. Existing live revision remains ca68422a7d6552d1557a65cb117104d7d5cf9abc. At15:19UTC: /api/health204, /api/app-version200, /privacy200, **/support404, /delete-account404**. Their fixes are local; live success is not claimed.

After missing0042provenance is resolved and required config prepared, present the exact candidate SHA, journaled0049 command with proven timeout handling, narrow environment changes and existing main-backed service deployment for explicit approval. Main push can trigger deployment. Do not split frontend/backend into invented services: this is one Next Node deployment. Preserve additive0049 on application rollback; no blind DROP/ledger edits or whole-DB restore that discards fresh writes.

## Tests / signed Android

- Web72unit tests PASS; TypeScript PASS; production build PASS; ESLint PASS before helper change. Helper syntax checks PASS; post-change lint PASS.
- Disposable local item3 HTTP/browser suite PASS: auth/CSRF/Google mocks/MFA/password, typing/privacy, two-device token/logout/account-switch, report/block, deletion/session/media cleanup and settings anchor.6public pages/18layouts/11links/0broken links/0browser errors. No actual email/FCM provider call claimed.
- Dependency audit PASS with existing specifically reviewed development advisory exceptions; no new suppression.387-commit Gitleaks scan PASS.
- Existing signed AAB cryptographic/bundletool verification PASS: chat.circlo.app13/0.9.4/target36, approved certificate, artifact unchanged. APK SHA256 also matches its recorded signed evidence. No native rebuild/resign. Android testReleaseUnitTest/lintRelease command PASS (unit task up-to-date); existing0errors/42lint warnings retained, Gradle deprecated-feature warning remains. ADB lists no attached device; no claim of fresh physical tests.
- Phone/real Google/FCM, Play-delivered signer, reviewer access and Console declarations remain manual gates. Existing friends' APK tests are informal history only.

## Necessary next actions

1. Supply only the local path to an existing Firebase Admin service-account JSON for ziptalks-5b402, if available. Do not paste contents. Otherwise obtain one privately from the existing project's authorized administrator; no new project/billing required by this plan. Validate project/key/IAM before proposing Render configuration.
2. Prepare/test a forward repair for the12missing RLS settings with the limited runtime role, and reconcile the missing0042history with historical evidence; approve that exact repair separately. The normal runner skips timestamps older than its last entry, so simply redeploying does not repair0042. No production migration while this is unresolved.
3. Agree secure portable backup-key recovery and offline upload-keystore/password backup; DPAPI-only material is not cross-computer recovery.
4. Only when gates close, approve exact push/migration/environment/deployment scope. Then verify live support/deletion and execute designated test-account/device smoke tests. No destructive real-account testing.
5. Owner supplies truthful Data Safety/rating/moderation/reviewer/Console information and actual closed-test/device evidence. No guessed declarations or Play approval guarantee.

**Final status: recovery/access and local tooling improved; production rollout and official closed testing remain NO-GO.**

Local implementation commit: `67690b4` (backup policy-role dependency checks and offline migration provenance verifier); unpushed. Backup, keys, client config and private operator helpers are not staged. Documentation/evidence is committed separately.
