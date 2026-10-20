> Update: see PHASE_5_EXECUTION_RESULTS.md for successful current access/backup verification and remaining migration/configuration blockers. The following is historical preflight evidence.

# Controlled production rollout preflight

16 October 2026 (Asia/Dubai). **STOP / NO-GO for production execution.**

Read FINAL_RELEASE_GO_NO_GO.md completely. No push, migration, deployment, environment change, backup restoration, paid resource or production data mutation was performed. This is an execution preflight, not a new broad compliance audit.

## Critical gates

| Gate | Result / evidence | Required before execution |
|---|---|---|
| Current restorable production database backup | NOT VERIFIED — therefore blocking. Repository backup utility exists; historical ignored backup metadata is not current restore evidence. No provider PITR window, successful isolated restore, RPO or RTO has been verified. | Identify actual live primary database from host configuration, verify current snapshot/PITR and restore to isolated empty destination; record time, checksum/backup ID, ledger and row-count/integrity results. |
| Actual production configuration | NOT VERIFIED — blocking. Read-only Render connector exposes deployment metadata, not environment-variable values/presence. Local env files and compiled Android Firebase config cannot establish live server configuration. No mutation endpoint was used to inspect secrets. | Authorized operator/read-only provider access must verify names and validity below; report booleans/matches only. |
| Live ledger, roles and locks | NOT VERIFIED — blocking. No production SQL executed. | Read-only ledger/hash/schema/size/locks/DDL-role assessment and a staging rehearsal; stop if any earlier migration differs. |
| Deployment revision | PASS scoped: Render read-only list_deploys returned live dep-db8pcbdbedkc73f3buh0 at ca68422a7d6552d1557a65cb117104d7d5cf9abc. | Recheck immediately before approval/execution. |

A failure to obtain critical evidence is not evidence that no backup/configuration exists. It means safe execution cannot be authorized yet. Further production actions stop here under the owner's instruction.

## Migration 0049: exact impact and compatibility

File: drizzle/0049_fcm_session_binding.sql. One ALTER TABLE adds nullable UUID fcm_tokens.session_id referencing device_sessions.id with ON DELETE CASCADE. No default, backfill, UPDATE, DELETE, table creation, explicit index creation, policy/RLS change or changes to existing column definitions. PostgreSQL creates a foreign-key constraint, not an index on the referencing column. Existing token rows receive NULL; existing indexes/unique constraints remain.

Deletion cascade is from deleting a device_sessions row to its referencing fcm_tokens rows, never the reverse. Applying the migration itself does not revoke sessions or delete tokens. It touches neither users nor message/encryption-key/media tables. This source-level assessment is not a verified production data-integrity claim.

Old ca68422 sender selects token/platform by user; registration inserts explicit old columns, so the additive nullable column is compatible with those reviewed paths. New src/db/schema.ts, api/push/register and auth/logout require the new column; new code must never start against the old schema. New server/web-push.ts joins matching-user active unrevoked unexpired approved sessions and requires android-webview-v1. Legacy NULL/unmatched/platform-old tokens are excluded until authenticated updated-client registration. **Native notification continuity for old installations is not guaranteed.** Existing message storage/delivery is separate; do not auto-bind tokens or weaken trust to hide this transition.

ALTER TABLE still acquires locks. Table size, FK validation/lock duration and concurrent workload have not been measured. No zero-downtime guarantee. This is another prerequisite to the proposed order, not permission to run raw ALTER.

## Frozen candidate and services

Application candidate: e6e3b5d935b91708afca81bb209dd75696197d51, branch codex/device-recovery-20261013. This new preflight document is review material, not a changed application candidate. Existing service: circlo / srv-darbkvu7bikc738b21j0, owner-approved workspace tea-d3ir0qh5pdvs7395u2j0, main-backed Node service, circlo.chat. Primary app database is documented as Neon PostgreSQL; Supabase is object storage, not the target for blindly applying this migration. No duplicate service or Android rebuild is proposed. Signed chat.circlo.app 0.9.4 (13), SDK36 identity stays unchanged.

Complete candidate commit range after deployed baseline:

```text
c778ce16cc811b19db84a79aafadf931a2111d63 docs(android): audit TWA and Google Play readiness before implementation
c7b1b3ac5fb5a4c12958b71a33d43a534dbc5819 fix(pwa): restore offline retry under strict CSP and exclude Android secrets
765ab6b1ed31ccb0cf57db7b5a3e3b2e2af288f8 chore(android): prepare isolated TWA tooling with fail-closed release gates
a95a95f72a9af836b3f942850fbeab87b1c154d9 feat(android): prepare fail-closed public Asset Links and signing identity guidance
e41a9e68a268089933ead7792b51e313228ffa1e fix(privacy): add browser deletion help and verify reporting and account cleanup
9dc5894454f36edb09290aada890c9ea776ff0d7 fix(android-tools): patch compatible UUID dependency and document remaining advisories
b11a72c0b556e2bb8ad53d61558014756b94e2d3 fix(android): harden and rebuild existing hosted WebView without replacing its identity
c5f8e090609e55df8abb080a4ea1651fe9be20b8 docs(android): record existing APK verification and Phase 2 release gates
ba28972c3e3894116aeb66f9df5948ab84995a15 fix(push): bind native registrations to sessions and protect notification metadata
8898ec73842abf46c26a2ade7a5151f92e4a452d fix(android): integrate origin-scoped Firebase notification lifecycle
22e6afb655b395e2034369205e073a4efc186491 docs(android): record Phase 3 builds and closed testing gates
c3096f216a7e1f1e9b392a0a54a1411969c59633 build(android): prepare approved Circlo identity and secure release signing tools
3f6ed033431283f5002766fe01eb26409366ad59 docs(android): record signed release verification and final compliance holds
1a1c1fa80727e4bda834805853f069923ca440f7 fix(privacy): open account deletion settings from public recovery links
e6e3b5d935b91708afca81bb209dd75696197d51 docs(android): prepare final go-no-go and approval-gated production rollout

```

Only new migration files in that range: 0049_fcm_session_binding.sql and meta/_journal.json. Render main checksPass auto-deployment means a main push can deploy; no push is authorized by preparation.

## Configuration verification required (never put values in evidence)

- Render: DATABASE_URL points to intended runtime database; REALTIME_DATABASE_URL same intended database; MIGRATION_DATABASE_URL (if configured) targets that same database with separate authorized DDL role. Confirm ledger grants and runtime-role sync. Preserve JWT_SECRET so sessions stay valid.
- Canonical CLIENT_URL and GOOGLE_CALLBACK_URL match circlo.chat; preserve GOOGLE_CLIENT_ID/SECRET. Verify Android package/upload certificate with actual web OAuth Cloud project; Firebase project alone is insufficient.
- Native Firebase: server FIREBASE_PROJECT_ID matches ziptalks-5b402 and FIREBASE_CLIENT_EMAIL/PRIVATE_KEY authenticate appropriately for that project. Existing Android matching client is static evidence only. Do not log private key or send test pushes to real users.
- Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_STORAGE_BUCKET match existing private storage; confirm bucket policies/access and retain object bytes. Database dump does not back up object files.
- Preserve VAPID_PUBLIC_KEY/NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT; verify existing email sender/API configuration, CRON_SECRET, maintenance/media/scanner and CSP settings. Set only approved PUBLIC_SUPPORT_EMAIL to mudassarmalak090@gmail.com after approval. Do not rotate secrets or enable placeholder DAL trust.

## Backup restoration procedure — preparation only

Use existing scripts/database-backup.mjs only after validating scope and protecting destination outside Git/cloud sync. It dumps public/drizzle schemas, extension manifest, no ownership/ACL. It is **not** a complete cluster/role/provider/storage backup. Verify all application schemas, required roles/grants, extensions and object storage separately. Use matching supported PostgreSQL tools; credentials via protected environment, never command-line URL/logs. Windows directory ACL must be explicitly restricted; POSIX mode flags alone are insufficient.

For an approved protected backup: verify SHA256 and companion manifest, inspect pg_restore listing, supply RESTORE_DATABASE_URL for a separate **empty isolated database**, then run `node scripts/database-backup.mjs restore <protected-backup-path>`. The helper refuses populated destinations and restores in one transaction. Verify ledger, constraints, counts and representative fake/authorized workflows using the old application and candidate. Record successful restore timestamp and measured duration. A listing/checksum alone is not a restore test. Do not point RESTORE_DATABASE_URL at production.

Emergency actual production recovery requires separate approval: stop writers, preserve post-backup activity for reconciliation, restore to a separate target, validate roles/data/object references, then deliberately switch connections. Full database restore loses later writes unless reconciled; do not use it as routine app rollback. Provider PITR may be preferable but its window and restore path remain unverified. Old E2EE ciphertext still requires browser/recovery keys; a server backup does not reconstruct private keys.

## Conditional deployment sequence — NOT APPROVED; do not execute

1. Close all critical gates above; record approved candidate SHA, live SHA, protected configuration snapshot, verified backup/restore reference, affected legacy-client notification plan and designated fake test accounts. Rehearse old/new compatibility on restored staging with bounded lock/statement timeouts.
2. Obtain explicit approval for coordinated Git push/merge, exact migration, narrowly enumerated environment changes and deployment/rollback. Account for auto-deploy before any main update; never push first and inspect later.
3. While old app serves, use existing journaled migration runner with authorized DDL connection to apply only verified pending0049. Abort on lock timeout, ledger discrepancy or migration error. Never manually ALTER separately from ledger. Confirm schema and old-app health before proceeding.
4. Apply only approved config changes at coordinated deployment, preserving unrelated values. Deploy frozen main candidate to existing service using existing build command and npm start. Startup also runs journaled migrations; confirm0049 is already recorded and runtime role grants succeed.
5. Verify health and exact app-version, then smoke tests below. Observe redacted errors, DB locks and latency/SSE reconnect. Do not describe historical160-second build as downtime; real interruption remains unmeasured. Halt new APK distribution until notification/login acceptance is proven.

## Post-deployment smoke checklist

- Anonymous support/delete-account/privacy direct URL and refresh200, correct contact and canonical host; no auth requirement for public help.
- Existing session remains valid; password/Google/MFA/device gates work; incorrect credentials/CSRF rejected; new login cannot bypass trust.
- Two designated test accounts: existing ciphertext decrypts, new direct/group send/receive/read/typing, reconnect/queued messages without duplication or plaintext fallback.
- Existing media remains accessible only to authorized users; new approved image/voice upload/download works.
- Updated native client registration, background/cold notification and tap routing; revoke/logout/account-switch excludes old ownership; browser push still works. Real physical results recorded separately.
- Deletion CTA opens account-data after refresh without mutation. Destructive deletion only with separately approved disposable account; verify fresh-auth rejection, session/token revocation and shared-media preservation.
- Check error rate, latency vs baseline, DB connection/lock pressure, health and cleanup retries. Set numerical abort thresholds from staging baseline before execution; none invented here.

## Rollback and forward recovery

Prefer old application revision plus unchanged secrets and **retain0049**. Reviewed old queries tolerate the nullable column. Never drop column while candidate runs or erase ledger entries. Old native sender lacks new session-bound protocol: freeze new APK rollout and use separately approved native-push disable if rolling back; alerts may be unavailable. Confirm actual disable mechanism before approving rollback.

Column removal requires reviewed compensating migration only after all dependent readers/writers are removed. Token session bindings lost by dropping cannot be reconstructed safely without re-registration. Account deletion, storage erasure and external notifications are irreversible by app rollback. Database-wide restore can lose unrelated fresh messages/accounts; prefer forward fixes for data issues and reconcile any restored writes. No JWT/VAPID/key/trust resets as shortcuts.

**Approval is not requested to deploy now: critical verification remains incomplete. No production execution can proceed until evidence closes these gates.**
