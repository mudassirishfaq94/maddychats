> Update: see PHASE_5_EXECUTION_RESULTS.md for successful current access/backup verification and remaining migration/configuration blockers. The following is historical preflight evidence.

# Production deployment gate â€” Circlo 0049

**Decision: NO-GO. Production verification is BLOCKED by unavailable authenticated configuration access.**

Evidence date: 16 October 2026, Asia/Dubai (UTC timestamps below). Read `CONTROLLED_ROLLOUT_PREFLIGHT.md` completely. Candidate remains `e6e3b5d935b91708afca81bb209dd75696197d51`. No Git push, deploy, production SQL/migration, configuration change, provider resource creation or paid operation occurred. Only existing local backup data was restored into a new local isolated cluster; it was stopped afterward. No application code or signed Android artifact changed.

## 1. Gate results

| Check | Status | Evidence / limitation | Required action |
|---|---|---|---|
| Read-only production configuration access | **BLOCKED** | GET using the saved Render CLI credential to the existing service env-vars API failed with HTTPError during this run (inspection helper timestamp 2026-10-16T14:32:37.594120+00:00; the HTTP failure did not retain its own response timestamp). No values were displayed/saved. No retries through write endpoints and no fallback to a guessed local database. | Reauthenticate Render privately as described below. HTTP status was not retained; do not infer token expiry vs permissions. |
| Actual current primary database identity | **BLOCKED** | Historical backup automation retrieved DATABASE_URL from Render and addressed Neon. Prior architecture records say Neon primary DB, Supabase object storage. Current live URL/branch/database cannot be verified because configuration access failed. | Compare current Render DATABASE_URL, migration and realtime targets privately to the actual Neon project/branch/database. |
| Current provider backup/PITR mechanism and timestamp | **BLOCKED** | No authenticated Neon backup/PITR settings or recovery window available. Historical logical pg_dump files exist; these do not prove today's managed backup policy. | Verify plan/window, latest recoverable time, branch/database coverage and restore permissions in the identified Neon project. Do not assume a free plan has a particular window. |
| Historical archive integrity | **PASS â€” historical scope only** | 179,004,111-byte `render-neon-pre-cutover.dump`, filesystem timestamp2026-10-09T10:25:21Z; SHA256 matches its previously recorded companion manifest. Dump was fully decoded and restored, not only listed. See attached evidence. | Retain as historical evidence; do not substitute for a fresh backup. File mtime is not independently authenticated snapshot/PITR time. |
| Isolated restore and row counts | **PASS â€” historical scope only** | Completed2026-10-16T14:37:56Z. New PostgreSQL18 cluster, SCRAM random password,127.0.0.1:55816 only, separate database, no app or external providers started.38tables' COPY row counts all match fully decoded archive. Restore30.99s, whole successful harness46.97s. | Repeat using a fresh consistent production snapshot after access is restored. |
| Restored integrity/objects/extensions | **PASS â€” historical scope only** |66FKs checked:0dangling references,0unvalidated FKs;0invalid/unready indexes.122indexes,2sequences,38tables restored. pg_trgm1.6 and plpgsql1.0 available. Unique/PK constraints restored with pg_restore exit-on-error/single transaction. | Compare a fresh source snapshot's schema/object inventory with restored result; verify roles/grants separately. |
| Current backup completeness / RPO | **BLOCKED** | Restored archive has14historical ledger rows and no device_sessions table. It predates the current release's schema. A second existing archive is dated9October11:02UTC and was not restored in this task. Neither is proof of current recovery coverage. | Fresh backup and actual isolated restoration; record source snapshot time and all required schemas/extensions/objects. |
| Backup file confidentiality | **FAIL** | Older archives under the original checkout's .freebuff/backups inherit read access for BUILTIN Users and Modify for Authenticated Users. New test directory/copy has inheritance removed and owner/SYSTEM-only ACLs, outside Git. | Privately restrict the original backup directory/file ACLs after reviewing ownership; verify no other copies/cloud sync. Do not upload archives or manifests containing credentials. |
| Render required runtime variables | **BLOCKED** | Rejected authenticated GET; no actual presence/validity claim. `.env.example` and local .env are not evidence. | Review matrix in section3 using actual current service configuration. |
| Supabase configuration | **BLOCKED** | No current host URL/key/bucket identity verified. Storage is separate from application DB. No storage calls/mutations attempted after access failure. | Verify configured bucket/project and private access/policies; independently preserve object bytes/lifecycle. |
| Firebase server configuration | **BLOCKED** | Android matching client is known static evidence; actual backend project/service-account configuration and permission are unverified. | Verify server project matches existing ziptalks-5b402 and service account/key/project compatibility, then separately approve real device/provider tests. |
| Production migration ledger /0049 already applied? | **BLOCKED** | No production SQL executed because current target/access could not be established. Historical ledger is not today's ledger. | Run supplied bounded read-only SQL on the verified live target; compare every timestamp+hash to the journal. |
| Production schema drift/gaps | **BLOCKED** | No live schema/constraints/indexes/policies inspected.51journal entries locally; only0049 is new relative to last recorded deployed baseline. | Confirm earlier entries exactly match, no unknown entries/duplicate timestamps, and0049 column/FK agree with its ledger entry. |
| Migration source effects | **PASS â€” source inspection** | Exact SQL, old sender/registration and new schema/registration/logout/sender inspected. Details below. | No SQL edits needed on this evidence; do not apply yet. |
| Live table size/activity/locks | **BLOCKED** | No production query or safe live connection available. Historical fcm_tokens count0 is irrelevant to current activity. | Bounded metadata snapshots during representative activity and a fresh restored-data rehearsal before execution approval. |
| Old/new source compatibility | **PASS with notification limitation** | Additive nullable column tolerated by reviewed old explicit-column queries. New code requires0049. Legacy native tokens intentionally excluded until secure re-registration. | Agree supported-client transition and test on fresh staging; no automatic binding/bypass. |
| Safe final production execution | **BLOCKED / NO-GO** | Critical evidence above remains absent. No zero-downtime/data-recovery guarantee. | Close gates, then seek explicit coordinated approval; this document is not approval. |

## 2. Historical restore evidence and limitations

See `HISTORICAL_BACKUP_RESTORE_EVIDENCE.json` for checksum, timestamp, all38aggregate table counts and object/integrity totals. Representative counts: users42, messages581, e2ee_keys61, e2ee_conversation_keys1350, e2ee_key_history548650, message_attachments22, fcm_tokens0. No user records, message contents, tokens, keys or credentials are included in the evidence.

The successful local restore copy/cluster is under the owner-only directory `C:\Users\mudas\CircloRelease\preflight-20261016-143709`. Archive and database contents are private, not Git artifacts. The cluster was shut down; pg_isready subsequently reported no response on55816. Temporary password input file was deleted. Earlier interrupted/failed harness clusters were also stopped; their protected directories remain private. The initial Windows subprocess harness was interrupted and the local metadata verifier needed a PostgreSQL name-array-to-text-array parser correction; final counts/FK checks passed. No failed attempt is being presented as the successful run.

The observed31-second restore is a **local historical-dataset measurement**, not production RTO. Complete recovery also needs backup transfer, provisioned target, roles/grants, extensions, secrets, validation, cutover, object storage consistency and post-snapshot write reconciliation. RPO is unknown without a current snapshot/PITR window. This old archive cannot recover subsequent activity or the current session schema.

Dump scope is public/drizzle, no ownership/ACL restoration. It does not back up cluster roles, credentials, provider settings, other schemas, Supabase object bytes or browser-held E2EE private keys. Existing ciphertext cannot be decrypted solely by restoring the server DB. Count equality validates archive-to-restore fidelity, not completeness relative to today's source. No live before/after count comparison is claimed.

## 3. Exact intervention to unblock configuration and DB access

1. On this trusted computer, privately run `render login` to refresh the existing CLI session (Render CLI skill documents this flow). If CLI is unavailable, sign in through the Render Dashboard. Do not paste API tokens, URLs with passwords or exported env files into chat/Git. Reuse **My Workspace**, service **circlo**, `srv-darbkvu7bikc738b21j0`; no service creation or Save/Deploy action.
2. Confirm read access to that service's current Environment page. A refreshed credential must successfully authorize read-only service/env access; a login alone is not proof. Report only present/missing and compatibility booleans. No variable updates are authorized.
3. From that current configuration, identify the exact primary DB provider/project/branch/database privately. Confirm DATABASE_URL, REALTIME_DATABASE_URL and optional MIGRATION_DATABASE_URL address the same intended database (normalize Neon pooled/direct hostnames before comparison). Migration URL may legitimately be absent if runtime URL already has DDL rights; record actual privileges, do not broaden them. Do not use Supabase SQL to inspect a Neon database.
4. Open the correct Neon SQL Editor or an approved TLS-verified read-only SQL connection. Execute `docs/android/production-preflight-readonly.sql`. It uses BEGIN READ ONLY,5s statement/1s lock limits and ends with ROLLBACK. No query text from other sessions, private records or credentials are exported. If permission/timeout occurs, ROLLBACK and report; do not change grants, cancel other users or raise limits blindly. Statistics visibility must be adequate before interpreting zeros. Repeat snapshots to measure deltas during representative traffic.
5. Provide only sanitized results/ledger JSON or restore access so the inspection can be resumed. No production migration commands should be run as part of these steps.

Required configuration verification:

| Names | Check privately; do not reveal values |
|---|---|
| DATABASE_URL / REALTIME_DATABASE_URL / MIGRATION_DATABASE_URL | Current target consistency, valid TLS/auth, runtime vs authorized migration privileges; preserve DB identity. |
| JWT_SECRET | Present, unchanged; no rotation/session invalidation. |
| CLIENT_URL / GOOGLE_CALLBACK_URL | Canonical circlo.chat and correct existing callback path. |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Present and existing compatible web OAuth project; Android package/certificate verified there separately. |
| FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY | Present, project matches Android client ziptalks-5b402; valid matching service-account/key and FCM API/IAM. Presence/key parsing alone does not prove delivery authorization. |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET | Existing correct project/private bucket; server-only key, expected bucket access and preserved objects. |
| VAPID_PUBLIC_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | Runtime/client compatible public keys, retained existing private key/subscriptions and valid subject; respect actual push-configuration fallback behavior. |
| RESEND_API_KEY / EMAIL_FROM or configured name/address pair | Existing authorized sender and reset/recovery path; real mail requires separate testing authorization. |
| PUBLIC_SUPPORT_EMAIL | Approved public mailbox correctly configured; do not set during preflight. |
| CRON_SECRET / maintenance, media, scanner, CSP settings | Existing enabled safeguards retained; actual cleanup operational behavior verified. No relaxed security or placeholder DAL trust. |

## 4. Fresh backup and isolated restoration instructions

After correct current DB access is verified, an authorized operator must:

1. In Neon Console, record actual project/branch recovery window, latest recoverable timestamp and permissions; do not initiate paid branches/restores automatically. Confirm the DB shown by Render belongs to that branch. Record backup timestamp and scope, not credentials.
2. Prefer a fresh consistent logical snapshot for the existing local isolated rehearsal, or a provider restore to an already approved nonproduction target. Stop if no such target/access is available. An advertised PITR window is not an actual restore test.
3. Use an owner-only, nonsynced directory outside Git, protected before writing data. With verified TLS DATABASE_URL supplied through a private process environment and a matching PostgreSQL tool version, run from this reviewed worktree:

   `node scripts/database-backup.mjs backup <absolute-protected-path>\circlo-preflight.dump`

   This is a future read-only dump operation, **not executed against production here**. Set PG_BIN privately if required. Verify all relevant schemas first: the helper only dumps public/drizzle, records selected extensions and omits ownership/ACL. Supplement separately where the real inventory requires it. On Windows validate effective directory/file ACLs; POSIX mode options are insufficient.
4. Record snapshot start/end time, provider identity fingerprint, dump checksum/size, source schema/extension/object inventory and migration ledger. For exact source count comparison, use the same exported snapshot rather than independent counts against changing live tables. Never leave a snapshot-holding transaction idle for an extended period.
5. Set RESTORE_DATABASE_URL privately to a new **empty isolated database**, never the production URL. Ensure no app/worker/email/FCM/cleanup is running against it. Run:

   `node scripts/database-backup.mjs restore <absolute-protected-path>\circlo-preflight.dump`

   The helper enforces an empty public/drizzle destination and restores in a transaction. Preserve matching extension schema/version availability; verify roles/grants separately because dump omits them. Do not use --clean against production.
6. Fully decode archive data, compare every table COPY-row count to restored counts, validate all FKs/unique constraints/indexes/sequences, compare source object inventory, verify expected extensions and journal hashes. Rehearse approved old/new fake-account workflows on the isolated target with third-party effects disabled. Measure elapsed restore+validation time. No production DDL is allowed in this task.
7. Retain only sanitized count/metadata evidence in Git. Securely retain or deliberately remove private restored copies according to owner retention policy after testing; do not sync/upload them. Obtain new backup evidence close to the actual rollout because ongoing writes reduce its RPO immediately.

## 5. Migration0049 locking, transaction and ledger assessment

Exact SQL in `drizzle/0049_fcm_session_binding.sql`:

```sql
ALTER TABLE "fcm_tokens" ADD COLUMN "session_id" uuid
REFERENCES "device_sessions"("id") ON DELETE CASCADE;
```

It adds one nullable UUID column and FK, with no default/backfill/data updates/index/policy changes. Existing token rows are NULL. Deleting a referenced device session later deletes its bound token rows; no reverse deletion of sessions/users/messages. Existing message/key/account/media tables are not altered by this SQL.

Expect **ACCESS EXCLUSIVE on fcm_tokens** for ADD COLUMN and **SHARE ROW EXCLUSIVE on device_sessions** for the FK. The child lock blocks reads and writes; the parent lock can block session writes, affecting login/session operations while held. Locks last until transaction completion. No heap rewrite is expected for nullable/no-default addition; all preexisting values are NULL, but actual validation/lock duration still needs rehearsal on the correct server/version. Even a quick DDL statement can wait behind an old transaction and queue application traffic. See [PostgreSQL ALTER TABLE documentation](https://www.postgresql.org/docs/current/sql-altertable.html).

The installed migration implementation is transactional; journal entry and DDL are committed together. Pending earlier entries can extend the transaction. The runner compares last migration timestamp, not a full historical checksum audit; successful startup alone is not proof of no drift. `scripts/start-production.mjs` invokes db:migrate before serving, so an uncoordinated push/start is itself a production migration risk.

Expected local journal:51entries. Last pre0049 entry0048_device_signin_gate: timestamp1792281600006, SHA256 `a80b28b524b3f7c63dde4eb72a0cd837fdb56588bd16d1bc23ff54af48bdc5db`.0049: timestamp1792281600007, SHA256 `6792ec9d5e58ed96f77382652b1afec204ebd1c966371ed34f3c53011b016e5b`. Compare **all** preceding entries, not IDs/numeric filenames alone (there are51entries ending0049). Hashes are SHA256 of the UTF-8 migration SQL text as read by the installed Drizzle reader.

If0049 is pending: all prior expected hashes/timestamps must match and column must be absent. If applied: timestamp/hash plus nullable UUID column, correct referenced PK and cascade/valid FK must all match. Column present without matching ledger, unknown hashes/timestamps, missing earlier migrations, or wrong FK is **FAIL drift**; do not repair ledger or run ALTER automatically.

Source baseline indexes: fcm_tokens PK(id), unique(token), fcm_tokens_user_idx(user_id); referenced device_sessions PK(id). No referencing session_id index is added automatically. New delivery queries filter by user and join sessions; current cardinality/activity is unknown. No speculative index added. Check live schema with supplied SQL, including RLS/policies, and measure revocation/delete workload before deciding any further index is justified.

Recommended initial bounded migration-session limits, to validate in staging: **lock_timeout1s, statement_timeout10s, idle_in_transaction_session_timeout15s**. Apply only to the approved migration connection(s), not global production settings. Confirm the actual runner/driver passes them through; do not assume psql-only PGOPTIONS affects every tool. Abort/retry in a quieter reviewed window on timeout; never kill user sessions or loop retries.10s is a safety cap, not a promised outage budget. If rehearsal cannot stay comfortably within it, redesign/review before approval. No production DDL or local0049 execution was performed here. The supplied read-only SQL was syntax/execution checked against the existing loopback fake-data integration database with ON_ERROR_STOP; it passed. This is not production ledger evidence.

Old baseline explicit-column sender/register tolerates the additive column. New schema, push registration/logout and session-joined sender require0049 first. Legacy NULL/old-platform tokens are deliberately excluded until the updated authenticated client re-registers. Messages/E2EE must never use plaintext fallback or weakened device trust to mask notification enrollment. Current fresh-data compatibility remains BLOCKED until rehearsal.

## 6. Conditional execution order and recovery â€” no approval granted

1. Restore authenticated read-only access; verify target/env/ledger/drift/size/activity, current backup and isolated restore. Capture protected configuration baseline, exact candidate/live hashes, supported client transition and smoke-test accounts. Rehearse lock limits/old-new compatibility on current restored staging. Stop on any critical failure.
2. Present exact scope for explicit approval: approved source SHA, one pending migration only, narrowly listed environment changes and existing service deployment/rollback. Last recorded live baseline is ca68422a7d6552d1557a65cb117104d7d5cf9abc; this task did not refresh live metadata after access failed. Candidate e6e3b5d935b91708afca81bb209dd75696197d51. Existing service circlo / srv-darbkvu7bikc738b21j0, main, previously observed autoDeployTrigger checksPass. New docs are uncommitted review material, not another application candidate.
3. Only after approval, while old app serves, apply exact pending0049 through the existing journaled migration path with confirmed bounded limits and authorized DDL role. No raw ALTER separate from ledger. Verify old-app health and schema/ledger before continuing.
4. Coordinate approved environment changes/push/merge/deploy together because main checksPass can automatically deploy. Keep credentials, JWT/VAPID keys, DB/storage identity and Android signed release unchanged. Existing startup should find0049 already applied. One migration operator only.
5. Verify exact health/version and public support/deletion direct navigation+refresh, retained sessions/Google/password/MFA/trust, two designated accounts' old/new encrypted direct/group messages and reconnect, media authorization/upload/download, browser/native notification registration/logout/account-switch/tap routing. Actual destructive deletion only with separately approved disposable account. Observe errors, latency, locks, reconnect and cleanup; no physical PASS without recorded phone evidence. Do not distribute new APK as supported before compatible backend checks pass.

Application rollback: return to recorded previous application revision while **retaining additive0049** and restoring only explicitly changed settings. Never remove ledger entries or drop column under new code. No rollback was executed. Old sender lacks session-bound filtering/protocol; freeze new APK rollout. If needed and explicitly approved, native push can be disabled for a restarted old process by withholding its Firebase Admin private-key setting (source initialization returns null when required fields absent); first retain it in the protected configuration snapshot. This intentionally pauses native alerts, not encryption/message delivery. Do not do this during preflight.

Forward recovery: prefer a reviewed fix for data/protocol issues after migration. Dropping session_id discards bindings and needs a compensating migration plus re-registration; never auto-reconstruct trust. Actual account/media deletion and already-delivered notifications are not reversed by application rollback. Whole-DB restore loses newer writes and requires separate stop-writer/cutover/reconciliation approval; object storage/private client keys are separate. Do not rotate JWT/VAPID or delete device trust as a shortcut.

**Final recommendation: NO-GO.** A real historical restore is now verified; current production recovery, env compatibility, ledger/drift and live locking remain BLOCKED. Next owner action is private Render reauthentication and read-only access to the identified Neon project. No push, deploy or migration is requested/authorized yet.
