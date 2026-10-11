# Secure login latency follow-up

The goal is login p95 below 500 ms without lowering bcrypt cost 12, caching password verification, bypassing MFA, disabling rate limits, adding paid infrastructure, or changing ordinary login responses.

## Changes

Verified password accounts no longer make a duplicate MFA eligibility query before the existing final sign-in guard. Unverified accounts retain the early suspension check before proof/email work. Account and MFA lookups reuse compiled parameterized SQL, never cached result rows; case-insensitive identifier matching and freshness are tested.

Native password concurrency is explicitly bounded to 1-3 operations, with the default retained at 2. The setting reserves a libuv worker where possible. Four waiters, a one-second queue timeout, cost 12 and retryable overload behavior are unchanged. Invalid tuning values cannot create an unbounded pool.

Opt-in loopback diagnostics measure rate limiting, account lookup, queue wait, native hashing, eligibility, atomic session persistence, JWT signing and total handler time. No identifiers, passwords, hashes, cookies, tokens or error bodies are logged. Ordinary production logins have no timing output or timing headers. One-off production probes must supply the existing private HEALTHCHECK_SECRET; they expose numeric Server-Timing metrics only to that authorized caller, still require valid primary credentials and all normal guards, and produce no diagnostic logs. Diagnostic state is isolated per request using AsyncLocalStorage. Session_setup contains eligibility/persistence/JWT time; nested stages must not be added together.

## Worker comparison

Three sequential isolated login-tuning runs used the same production build, stages, fake accounts, password cost and connection cap. The build included diagnostics before the lookup/duplicate-read optimizations. The short profile reaches 20, 50 and 100 users with 15-second holds; it is a configuration comparison, not the sustained capacity certification. The unchanged full nine-minute profile validates sustained load separately.

| Active password operations | Login p95 | Bcrypt work p95 | HTTP failures |
| --- | ---: | ---: | ---: |
| 2 (control) | 351.7 ms | 328.6 ms | 0% |
| 1 | 339.8 ms | 322.3 ms | 0% |
| 3 | 348.8 ms | 329.2 ms | 0% |

All short-profile thresholds passed. Queue waits were effectively zero at p95. These small differences do not justify increasing concurrency or sacrificing worker availability. The default remains two. No claim is made that tuning alone explains the previous 680 ms measurement: the diagnostic control already ran faster under current machine conditions. Timing variation and host CPU allocation matter.

## Verification

All 20 unit tests passed, including native compatibility/cost, responsive timers, bounded overload/recovery, tuning bounds, concurrent diagnostic isolation, no public diagnostic headers, private-probe authentication and absence of credentials in diagnostic output. Isolated database tests exercised the actual login handler with correct/wrong passwords, suspended verified/unverified users, unavailable email proof, and MFA-required users. They also verify fresh case-insensitive lookups, atomic session/audit/presence persistence, expiry cleanup, immediate revocation, password-reset races, precise message pagination and encrypted message/scheduler data contracts.

Production build, TypeScript and lint passed. The mobile production login-page test passed Retry-After/cooldown checks with no horizontal overflow or browser exceptions. No paid services or speculative indexes were added.

The controlled pre-deployment production probe in live-login-before.json contains three sequential successful logins of owned temporary accounts, which were removed. End-to-end times were 2.17, 4.95 and 3.50 seconds. This small sample is not a p95 or a production load test. The prior deployed version exposes no handler timings; those samples cannot isolate server hashing from network/platform delay.

## Reproduce

After a production build, set LOAD_TEST_ADMIN_URL to the loopback postgres admin database. The runner creates/drops only its own generated fake-data database and blocks all third-party traffic.

```powershell
$env:LOAD_PROFILE='login-tuning'
$env:LOAD_TEST_LOGIN_TIMINGS='1'
$env:LOAD_PASSWORD_CONCURRENCY='2' # repeat separately with 1 and 3
$env:LOAD_RESULT_LABEL='login-two-workers'
node scripts/run-k6-load.mjs
$env:LOAD_PROFILE='full'
$env:LOAD_RESULT_LABEL='login-final-full'
node scripts/run-k6-load.mjs
```

Do not run simultaneous benchmarks on the same machine, change thresholds, shorten the full sustained holds or reuse production data. The local k6 runner rejects public targets. Private live probes are a few sequential requests using owned fixtures; they are never a substitute for local load testing.

## Sustained results and selected configuration

Both final full-profile runs retained the original 500 ms / 1% thresholds and original sustained holds. With two workers, login p95 was **518.8 ms**; with one worker it was **613.0 ms**. Both had **zero HTTP and semantic failures**. The 100-user aggregate hold p95 was respectively **131.4 ms** and **151.7 ms**. The target is therefore **not yet certified**. Both failed login thresholds are retained in k6-login-final-full-results.json and k6-login-one-worker-full-results.json, rather than replaced by the passing short runs.

Two workers remain the default and production configuration; increasing workers is not supported by the short-run differences. In the two-worker run, queue waits were effectively zero, while password work p95 was 464.6 ms. Lookup and session persistence p95 were 6.1 and 6.6 ms. Secure hashing and host scheduling dominate the remaining tail; speculative SQL/index/cache changes would not address that measured cost. The one-worker result confirms that reducing admission capacity does not solve the tail. No password strength or security check was reduced to meet the target.

## Mobile regression synchronization

Linux CI exposed a test race: recipient delivery occurred before the sender received its lost-response retry acknowledgement. The next workload reloaded while the correctly retained draft was still awaiting confirmation. The workflow now waits for the actual sender acknowledgement (empty composer) and committed encrypted-draft deletion before reloading. This adds assertions rather than clearing storage or weakening the app behavior. The complete isolated production-browser workflow subsequently passed: 320/360/390/412 widths, throttled typing and encrypted draft reload, lost-response retries, secure device approval/recovery, revocation, attachments, voice contrast/playback, status audiences, scheduling, and encrypted delivery; zero browser exceptions.
