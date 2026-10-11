# Local k6 capacity test

This test exercises the existing application's real HTTP routes and database writes. It never targets Render, Vercel, Neon, Supabase or another public host. No application authentication, encryption-required validation or rate limiting is disabled.

## Install and run

Use Node 22, the version required by this project, and a local PostgreSQL instance. Install k6 on Windows:

```powershell
winget install --id GrafanaLabs.k6 --exact --source winget
```

On macOS: `brew install k6`. An official portable Windows archive also works: download `k6-v2.2.0-windows-amd64.zip` and its checksum file from Grafana's GitHub release, verify SHA-256, extract it and set `$env:K6_BINARY` to the resulting `k6.exe`. The runner recognizes the verified local copy at `.freebuff/tools/k6/k6-v2.2.0-windows-amd64/k6.exe`.

From the project directory, with a disposable local PostgreSQL cluster running:

```powershell
$env:LOAD_TEST_ADMIN_URL = 'postgresql://YOUR_LOCAL_ROLE:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/postgres'
$env:LOAD_PROFILE = 'smoke'
npm run build
npm run test:load

$env:LOAD_PROFILE = 'full'
npm run test:load

# Optional control: 100 returning users, real logins completed before measurement.
$env:LOAD_PROFILE = 'steady'
npm run test:load
```

For the existing local QA cluster in this workspace, the connection is `postgresql://item1_test@127.0.0.1:55799/postgres`. It can be started with:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D '.freebuff/item1-postgres' -l '.freebuff/k6-postgres.log' -o '-p 55799' start
```

The PostgreSQL role needs permission to create databases. The runner creates and later drops only its newly generated `circlo_k6_<random>_test` database. It never resets or uses an existing application's database. Standard migrations and the concurrent delivery index migration are applied to that fresh database. Ports 3190 and 3191 must be available. `npm run test:load` starts the production standalone app and k6, records results, stops both servers and removes the database even when a performance threshold fails. A failed threshold is a useful result and yields a nonzero exit code, not a reason to relax security or stop collecting the remaining load stages.

## Workload

The fixture contains 200 fake users, 1,000 accepted direct conversations, 50,000 historical ciphertext messages, 1,000 public communities and one private community for each active user. Each VU has its own verified password account and ten conversations. Passwords are hashed using the application's actual bcrypt cost of 12.

Five user activities are scripted:

1. Log in once per virtual user using the real password login route and retain its session cookies.
2. Open the Chats HTML screen and load that user's chat list.
3. Read a paginated conversation history.
4. Send a synthetic encrypted payload with a unique retry/idempotency identifier and verify that the saved message appears in history.
5. Browse public communities while checking that private memberships belong to the current user.

Short randomized pauses between actions and 6–10 seconds of reading/typing time keep message volume under the existing anti-spam policy. The payloads are actual AES-GCM-generated synthetic ciphertext, but this HTTP test does not execute browser Signal encryption, key enrollment or device approval. Each user simulates a distinct client IP using a header on the local-only gateway. The app's existing limits remain active; a separate carrier-NAT/shared-IP abuse-policy test would be a different scenario.

The full profile ramps from 0 to 20 VUs in 30 seconds, holds 20 for two minutes, ramps to 50 in 30 seconds, holds 50 for two minutes, ramps to 100 in 30 seconds, holds 100 for three minutes, then ramps to 0 in 30 seconds. Total scheduled duration is nine minutes plus up to 20 seconds to finish in-flight journeys. The smoke profile uses two VUs for 25 seconds. Authenticated route modules are warmed before measurement; startup behavior is distinct from steady-state capacity.

The optional `steady` control logs all 100 users in sequentially through the real password endpoint before measurement, then ramps to 100 in 30 seconds, holds for three minutes and ramps down in 30 seconds. It retains normal device-session/revocation checks and uses real server-issued cookies. Only this returning-user control omits login latency thresholds because login is outside its measured workload; the full profile always measures login. The full profile retries unsuccessful login attempts after a five-second pause; during overload those retries can sustain the queue. Its result therefore describes a new-user burst with retries, not a clean 100-user already-authenticated workload.

Thresholds apply globally, per action and at each hold level: `http_req_duration p(95)<500` milliseconds and `http_req_failed rate<0.01`. Additional semantic checks catch a 200 response containing the wrong user, missing history or a message that was not saved. Requests use ten-second timeouts and never follow redirects. Failures are retained rather than excluded from latency statistics.

## Safety and costs

The k6 script rejects every non-loopback URL and requires a run-specific local gateway attestation before starting. The runner requires a `127.0.0.1` PostgreSQL admin connection and generates a new test database. Fixtures contain no real users, device keys or messages. Credentials/raw point logs are confined to the ignored `.freebuff/k6` directory. Reports contain aggregate fake-data measurements.

The app runs with payment, email, Google OAuth, Firebase, web-push and AI secrets disabled. Its network guard also blocks non-loopback sockets and external fetches, including third-party calls that might accidentally be introduced later. k6 usage reporting is disabled and the test has no remote JS imports. Outbound-guard behavior is probed before running. No managed service is provisioned and no paid API is exercised.

## Reading the report

See `k6-full-results.json` for per-stage/per-action p95, p99, failure rates, HTTP status counts, the k6 summary, and sampled database activity. The first failed hold level is the first demonstrated sustained overload in this workload; failed ramp stages may instead indicate expensive bursts of new logins. `login` appears mainly during ramps because real users do not sign in again on every click.

Read raw output locally in `.freebuff/k6/<run-id>/k6.log` and `points.json`. Distinguish 429 rate limits from 5xx server failures and timeouts. Virtual users here mean concurrently active scripted people with think time, not registered accounts or requests per second.

These HTTP capacity measurements share a Windows machine between the generator, Node server and PostgreSQL. They cannot certify the capacity of a 512 MiB Render instance, account for Internet latency, or measure mobile rendering, long-lived realtime streams, browser cryptography, media uploads, voice calls or paid providers. Use the existing mobile browser profiling script for rendering. If all levels pass, the breaking point has not been found: the evidence establishes only the highest tested passing level. Extend the stages on this same isolated local environment to investigate higher levels.

The executor and pass/fail thresholds follow the official [k6 ramping-VUs documentation](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-vus/) and [threshold documentation](https://grafana.com/docs/k6/latest/using-k6/thresholds/).

## Original full-run result before fixes (2026-10-11)

This section records the original baseline, preserved in `k6-full-before-fixes.json`. The current `k6-full-results.json` contains the rerun after fixes. See [bottleneck-fixes.md](bottleneck-fixes.md) for the implemented changes and current comparison.

The full nine-minute run completed all stages; k6 correctly exited with code 99 because thresholds were crossed. The run made 6,180 HTTP requests. No production server or paid provider was contacted.

| Phase | HTTP requests | Overall p95 | HTTP failures |
| --- | ---: | ---: | ---: |
| Ramp to 20 | 161 | 1,020 ms | 0% |
| Hold 20 | 1,137 | 70 ms | 0% |
| Ramp to 50 | 261 | 6,445 ms | 0% |
| Hold 50 | 2,775 | 183 ms | 0% |
| Ramp to 100 | 276 | 10,001 ms | 64.13% |
| Hold 100, with unsuccessful login retries | 1,352 | 10,001 ms | 94.60% |

Steady 20- and 50-user aggregate latency/failure thresholds pass. Individual logins still exceed the 500 ms action threshold: login p95 was 1,369 ms during the ramp to 20 and 8,172 ms during the ramp to 50. This is the first demonstrated bottleneck. With new users arriving at 100, requests time out at the test's ten-second ceiling. Failed responses were timeouts (status 0), not 429 abuse-limit rejections. The sampled server logs show connection-acquisition timeouts and uncaught rejections from scheduled-message processing. At that point the sampled PostgreSQL sessions were predominantly idle, with no observed lock-wait pile-up; blindly increasing PostgreSQL connections is not supported by this evidence.

`k6-password-before-fixes.json` isolates the original `bcryptjs.compare`. One comparison took 727–823 ms. Five concurrent comparisons took 3.73 seconds and raised event-loop p95 delay to 506 ms. This diagnostic supports password CPU work on the Node event loop as the first bottleneck; it does not establish that every later timeout has only that cause. The diagnostic now measures native async bcrypt in `k6-password-probe.json`. Run it with `node scripts/probe-password-load.mjs`; never run it during a measured load stage because it consumes CPU on the same machine.

Original prioritized recommendations, now implemented and evaluated in [bottleneck-fixes.md](bottleneck-fixes.md):

1. Move bcrypt verification to bounded worker threads or an audited native implementation, retaining cost 12, authentication checks and all rate limits. Password checks should not monopolize the event loop serving existing chats.
2. Add bounded admission/backpressure for concurrent login work and client retry backoff. Failed sign-ins should not create an indefinitely growing work queue that prevents signed-in users from sending messages.
3. Coalesce or move scheduled-message processing off every history request, and explicitly handle its asynchronous rejection. Instrument event-loop delay and per-pool queue wait before changing database connection limits; pool timeout symptoms alone are not proof of a slow database.

The 50-user hold is the highest passing steady level in the full run; sustained mixed new-login traffic failed by the 100-user level. This brackets the demonstrated failure between those levels for this exact workload and machine. It is not an exact maximum capacity or a promise about production hosting.

## Original returning-user control before fixes

The additional four-minute `steady` profile completed 6,817 requests after 100 sequential real logins outside measurement. During the three-minute 100-user hold, 5,458 requests succeeded with **0% HTTP failures and no failed data/persistence checks**, but overall p95 was **2,679 ms**, so the latency threshold still failed. Action p95s were: main screen 2,592 ms, chat list 2,561 ms, history 3,463 ms, send 1,962 ms, confirmation history 2,861 ms, communities 1,579 ms. There were no sampled server error lines in this control.

This confirms a sustained responsiveness limit at 100 active users even without login work. History is the slowest action in this control; CPU/serialization, repeated authorization/database work, per-request scheduled-message processing and pool queues need profiling to identify the remaining causal costs. Do not attribute this second bottleneck solely to password checks or promise that moving bcrypt alone makes 100 users fast. The control's PostgreSQL snapshots predominantly showed idle clients, which does not certify that no short expensive queries occurred between five-second samples.

Both original profiles correctly failed the requested thresholds. The 100-user control preserves authentication and encryption-required validation; it removes only new-login CPU work from the measurement. The original control is preserved in `k6-steady-before-fixes.json`; `k6-steady-results.json` contains the latest rerun. Test databases and listeners were cleaned up after each run.
