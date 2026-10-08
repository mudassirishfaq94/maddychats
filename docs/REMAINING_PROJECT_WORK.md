# Remaining audit work: implementation and release status

Updated 9 October 2026 (Asia/Dubai). This tracks the original execution order
in `ENGINEERING_AUDIT.md`; later task records used different numbering for
account security, deployment preparation, and CI.

| Original item | Implementation | Remaining release evidence |
| --- | --- | --- |
| 1. Realtime and shared abuse limits | Notification-driven delivery, shared PostgreSQL counters, fail-closed outages | Production concurrency/capacity measurement |
| 2. Tests and required CI | Local regression suites and hosted workflow | Hosted run; required merge checks need GitHub Pro for this private repository |
| 3. Administrative roles, fresh authentication/MFA, audit | Database roles, mandatory enrolled MFA on every admin write, fresh proof, transactional append-only audit | Staging administrator enrollment and operator recovery drill |
| 4. Upload safety and retention | Content checks, normalization, scanner and retryable inventory cleanup | Production scanner/worker monitoring and migration rollout |
| 5. Device sessions and CSP | Rotations, revocation, nonce policy, report collection | Real provider/native/PWA QA before strict-policy enforcement |
| 6. Mobile profiling | Browser lab, React/Web Vitals, SQL timing and realtime burst measurements | Actual Android/iPhone runs and production field measurements |

## Realtime design

`0037_realtime_and_admin_guards` adds a trigger that notifies only recipient
and event UUIDs after an insert commits. Message contents never enter a NOTIFY
payload. A single dedicated PostgreSQL `LISTEN` connection per Node process
wakes the shared dispatcher; one bounded row lookup serves all recipient tabs.
There is no periodic event-table polling. Notifications are untrusted hints:
delivery uses the stored row's recipient, not the claimed notification user.

The listener commits `LISTEN` before catch-up queries. Replay uses the
timestamp/UUID index and preserves PostgreSQL timestamp precision when paging.
Resume replays up to 5,000 events within the ten-minute retention window;
browser event IDs suppress duplicates. Larger gaps signal a server refresh.
Reconnects also refresh authoritative page data so gaps beyond retention can
recover. Pending identifiers and queued output have bounds; slow consumers
disconnect rather than accumulating memory. Listener failure closes streams
for explicit reconnect/replay. Session eligibility is still checked every
five seconds; this remains database work and is not an idle-query-free claim
for the whole application. Readiness checks the dedicated listener too.

Use an always-on Node/Docker host. `REALTIME_DATABASE_URL` defaults to
`DATABASE_URL` and must point to the same database through a direct or
session-pooler connection. The standard Supabase transaction endpoint on port
6543 is rejected. The listener adds one database connection per process;
account for it alongside `DATABASE_POOL_MAX`. Presence remains process-local,
so retain one web replica until shared presence is implemented.

Implementation follows PostgreSQL's documented
[LISTEN startup sequence](https://www.postgresql.org/docs/current/sql-listen.html)
and [post-commit notification behavior](https://www.postgresql.org/docs/current/sql-notify.html).
See Supabase's [connection pooling guidance](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
for persistent sessions.

## Administrative safety

Every administrative mutation requires enrolled MFA and a sign-in no more
than five minutes old, or a password plus an unused authenticator/recovery
proof. Attempts use the shared limiter. Existing administrator accounts can
read the dashboard and enroll MFA through their profile before writes.
Google/phone administrators can sign in again through the MFA ceremony.

Moderators cannot change roles or edit user credentials/identity. They can
moderate ordinary users and reports/messages; administrator identities are
protected. User/role mutations lock actor and subject in UUID order and
recheck database roles. Privilege changes revoke existing sessions. Restoring
an account never clears its revocation watermark. User identity edits use
bounded validation; email changes require renewed email verification. The
password-change input is `newPassword`, distinct from proof `password`.

Each mutation and its audit record commit in one transaction. Audit failure
rolls back the change. Database triggers reject audit UPDATE, DELETE, and
TRUNCATE, allowing only referential SET NULL cleanup while keeping identifying
details. Audit display retains entries whose actor account has been removed.
This does not protect against a trusted database owner disabling triggers;
independent audit export and restricted runtime database credentials remain
operational controls.
Administrative message deletion also queues recipient notifications in that
transaction and preserves attachment inventory for the retention worker.
Repeating an already completed deletion is idempotent.

## Verification and environments

`npm run test:remaining` destructively recreates **only** the loopback database
`remaining_hardening_test`, starts a production HTTP server on port 3111,
and uses fake accounts. Set `REMAINING_TEST_DATABASE_URL` explicitly. The suite
checks all admin write paths, moderator boundaries, stale proof, factor replay,
audit immutability/rollback, fail-closed rate-store outages, shared listener
count, bursts exceeding 200 events, recipient spoofing, replay and listener
failure recovery. If `pg_stat_statements` is preloaded, it also asserts zero
event-table reads during idle streams. The measurement artifact explicitly
records whether that instrumentation was available.

The local instrumented sample delivered 350 events to two tabs in **146 ms**,
using one shared listener and **zero idle event-table reads**. This is a local
fixture sample, not a production capacity guarantee. Details are in ignored
`.freebuff/performance/realtime-lab.json` and CI artifacts.

The real scanner check passed locally against portable **ClamAV 1.4.6** with
fresh official signature databases: harmless bytes were accepted and the
standard EICAR test signature was rejected. The executable archive was
verified against the publisher's SHA-256 release-asset digest. This validates
the engine/protocol integration on Windows; CI separately exercises Linux
ClamAV. No antivirus can inspect encrypted attachment plaintext on this server.

Browser integration now copies standalone static/public assets just as the
Docker image does and waits for the Web Vitals collector to initialize. Missing
JavaScript assets can no longer masquerade as an error-free mobile result.
See [the mobile baseline](./ITEM6_MOBILE_BASELINE.md) for the earlier sample.

GitHub's branch-protection API currently responds: “Upgrade to GitHub Pro or
make this repository public to enable this feature.” Repository visibility
must remain private. After a plan upgrade, require the workflow check
`Lint, types, build, security and integration` on `main`, including for admins,
and reject force pushes/deletion. Account billing/plan changes are not made
by this implementation.

Production requires a supplied accessible VPS/host, backups and a staging
cutover. Existing local secrets are not evidence of an available host. Keep
`CSP_ENFORCE=0` until actual Google/Firebase, native, PWA, upload/playback and
encrypted-chat flows pass staging tests. Physical Android/iPhone evidence
cannot be substituted by Chromium emulation. These release checks remain
open until their environments are available.
