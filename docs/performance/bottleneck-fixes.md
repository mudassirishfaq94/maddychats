# Measured bottleneck fixes

These changes address the three recommendations from the original local k6 report. They do not change bcrypt cost, weaken encryption, cache authorization results, add a paid service, enlarge the database pool, or load-test production.

## Changes

- Native asynchronous `bcrypt` 6.0.0 replaces request-thread `bcryptjs` in production password operations. Existing hashes remain compatible and new hashes retain cost 12. All hashing paths, including administrator password changes, use the shared helper.
- Password work has two active slots, four waiting slots and a one-second maximum queue wait. Exhaustion returns retryable HTTP 503 with `Retry-After: 5` rather than allowing an unbounded CPU queue. The browser respects retry delays on 503/429 without automatically resending credentials. Account creation and password reset hash outside transactions; reset tokens are still atomically rechecked for expiry and single use.
- Successful sign-in persists its audit record, presence update and device session atomically in one database round trip. An audit failure rolls back the session and presence update. Expired device sessions and MFA challenges are removed in indexed, 1,000-row background batches rather than global cleanup on every sign-in; expiry checks remain immediate. Login rate-limit responses now supply their actual Retry-After value.
- Session validation reads account, device and MFA state in one fresh query instead of three queries. Device ownership, expiry, revocation, suspension, logout watermark and MFA enrollment remain enforced on every request.
- Production route bundles and instrumentation share the same PostgreSQL pool in a process. The cap remains five, rather than creating duplicate pools.
- History requests no longer trigger independent global scheduled-job scans. The existing background maintenance processor delivers every ten seconds, catches failures and prevents overlapping runs. It starts for the same enabled starter configuration and for non-starter deployments.
- History stars, personal deletions and pins are read together with unique, viewer-scoped joins. Frequently executed history, membership, conversation-list and session queries reuse compiled parameterized SQL. Query results are never cached. Empty statement names avoid requiring named prepared-statement support from a transaction pooler.
- History cursors preserve PostgreSQL microseconds. Previously, converting the timestamp to JavaScript milliseconds could skip messages on the next page. Cursor pagination still orders by timestamp and message ID, and now handles timestamp ties accurately.

## Verification

Production build, TypeScript checks and lint passed. The standalone output includes native bcrypt binaries for Windows and Linux, including Linux x64 glibc/musl.

All 18 unit tests passed, including bcrypt hash compatibility, unchanged cost, responsive timers during hashing, bounded overload, recovery after overload, retryable responses without session cookies, and propagation of unrelated errors.

`scripts/test-session-query.ts` creates a disposable loopback database and checks valid sessions; immediate revocation, device ownership, expiry, suspension, logout and MFA; two-user history flags against the original individual queries; fresh results after updates; precise pagination; disappearance; background scheduled delivery without a history request; unchanged conversation membership, peers, pins, unread totals and latest messages; atomic sign-in audit/presence/session persistence, rollback on audit failure, bounded expired-session/MFA cleanup preserving active sessions; and concurrent single-use password resets with session revocation and expiry rechecked after hashing. The database is removed afterward.

`scripts/test-login-backoff.mjs` checks the real production login page at a 390×844 mobile viewport with mocked login responses. It verifies Retry-After behavior, retry after cooldown, no horizontal overflow and no browser exceptions. All external requests are blocked. This browser test checks the interface; the k6 runs exercise actual password login and message persistence.

A 20-second CPU profile during an exploratory local 100-user run identified repeated ORM query construction, PostgreSQL client work and garbage collection alongside framework/native work. That exploratory run is not the final before/after comparison.

The original nine-minute full and four-minute returning-user results are preserved in `k6-full-before-fixes.json` and `k6-steady-before-fixes.json`. The final reruns use the same isolated runner, 200 fake users, 1,000 conversations, 50,000 historical messages, five-connection cap, ramp stages, pauses, timeout and 500ms/1% thresholds. External services remain blocked and disposable databases are removed.

## Final before/after results (2026-10-11)

All values below are measured p95 server-request latency on the same local machine and workload. The tests used fresh disposable databases and a production standalone build, with outbound third-party connections blocked.

| Scenario/action | Before | After | HTTP failures after |
| --- | ---: | ---: | ---: |
| Full profile, 100-user hold | 10,001 ms timeout ceiling; 94.60% failures | 158.4 ms | 0% |
| Returning users, 100-user hold overall | 2,679.0 ms | 36.7 ms | 0% |
| Returning users, main screen | 2,592.1 ms | 51.4 ms | 0% |
| Returning users, chat list | 2,560.8 ms | 26.0 ms | 0% |
| Returning users, message history | 3,462.7 ms | 35.1 ms | 0% |
| Returning users, message send | 1,962.3 ms | 35.2 ms | 0% |
| Returning users, delivery confirmation | 2,861.0 ms | 36.8 ms | 0% |
| Returning users, communities | 1,579.2 ms | 26.8 ms | 0% |

The final full rerun after atomic sign-in persistence and background authentication cleanup completed **15,347 requests**, with **0 HTTP failures**, **0 semantic/persistence failures**, no sampled server errors and global p95 **138.0 ms**. All sustained hold and non-login action thresholds passed. The complete suite still exited 99 because the **login-only p95 was 680.1 ms**, exceeding its unchanged 500 ms threshold. This improves on the preceding run's 911.7 ms but does not certify sign-in below 500 ms. The original catastrophic timeout/retry collapse did not recur.

A separate instrumented 20-user diagnostic measured native cost-12 bcrypt at median **436.0 ms**, p95 **484.6 ms**, while database operations had median **2.6 ms**, p95 **11.0 ms**. Hashing CPU time, admission waits and request overhead dominate remaining sign-in latency. Password strength and the threshold were not reduced. A faster CPU allocation or a carefully designed separate authentication worker would require additional capacity validation; neither a paid service nor a password-verification cache was introduced.

The returning-user control completed **10,483 requests**, with **0 HTTP failures**, **0 semantic/persistence failures**, no sampled server errors, and **all k6 thresholds passed (exit 0)**. Its 100-user hold contained 8,726 successful requests. This validates the improvement in existing-user responsiveness separately from password login work.

The final full run's 20-user hold changed from 69.9 to 58.2 ms, and 50 users from 182.6 to 71.5 ms. Its 100-user hold was 158.4 ms, compared with 120.7 ms in the preceding exploratory release run; same-host measurements vary, and the additional authentication changes are not claimed to improve every request. The returning-user control above was measured before the final atomic-login/cleanup adjustment, which changes authentication writes and retention rather than chat read semantics. No exact new maximum capacity is claimed.

The independent native-password diagnostic measured single comparisons at **287–311 ms**, versus the original **727–823 ms**, retaining cost 12. Five concurrent raw native comparisons completed in **601.6 ms**, with event-loop p95 **16.2 ms**, versus **3,733 ms** completion and **505.9 ms** event-loop delay with bcryptjs. The raw diagnostic does not include the application's two-slot admission limit.

Final production build, TypeScript, full-repository lint, 18 unit tests, isolated database workflow checks, mobile browser retry checks and the existing dependency-audit policy passed. Temporary databases, test HTTP/debug listeners and the locally started PostgreSQL process were cleaned up. GitHub publishing and Render rollout are verified separately from these local capacity measurements. This report does not certify production latency.

## Reproduce

Use Node 22, a local PostgreSQL server, and the verified installed k6 executable. Do not point these tests at production.

```powershell
$env:LOAD_TEST_ADMIN_URL='postgresql://item1_test@127.0.0.1:55799/postgres'
npm run build
npx tsx scripts/test-session-query.ts
node scripts/test-login-backoff.mjs
$env:LOAD_PROFILE='full'
npm run test:load
$env:LOAD_PROFILE='steady'
npm run test:load
```

These measurements cover local server throughput, authentication and synthetic encrypted message persistence. They do not certify free Render host latency, mobile radio/network latency, browser encryption throughput or media/call capacity. No deployment is performed by these test scripts.
