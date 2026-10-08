# Tasks 4–6: uploads, device sessions, CSP, and mobile profiling

Scope follows items 4–6 in `ENGINEERING_AUDIT.md`'s saved execution order.
Earlier account-security, deployment, and CI work remains in place.

## Task 4: upload safety and retention

Every multipart route reads at most 4 MiB of actual streamed bytes, including
chunked bodies. JSON parsing also enforces its actual 64 KiB limit. Readable
avatars, group images, status images/videos, and chat background uploads use
one safety pipeline. Claimed MIME/extension must agree, image signatures must
match, and decoding is capped at 20 million pixels. Images become WebP,
without source metadata or appended payloads, bounded to 1024px for avatars
and backgrounds or 2048px for statuses. Animated images use their first frame.
HEIC/BMP are rejected by this pipeline; convert them to a supported format.
Readable routes share a database-backed per-account budget of 20 uploads/minute.
Video checks identify the container signature and scan the bytes; this does
not constitute full video decoding/transcoding. JSON data URLs cannot bypass
background image processing.

In production, readable uploads require `CLAMAV_HOST` and `CLAMAV_PORT`.
Clean raw bytes and normalized image output must pass clamd's
[INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).
Infections are rejected with 422. Missing, unavailable, malformed, or timed-out
scanner responses return 503 without persisting the upload. Development can
run without a scanner. Docker Compose includes a private ClamAV 1.4 service
with persistent, automatically updated signatures; port 3310 is not published.
Allow sufficient RAM and initial signature download/startup time.

Chat attachment bytes remain encrypted. The server cannot inspect or scan
their plaintext. It enforces envelope size, sanitized names, MIME syntax,
wrapped-key presence, membership, blocking, and group messaging permission.
Do not describe encrypted attachments as malware-scanned. Recipient-side
plaintext scanning requires a separate client design.

Migration `0035_upload_retention` adds a private storage inventory and
backfills known attachment, status, and avatar references. New storage writes
reserve the inventory row before writing bytes, so partial storage failures
remain discoverable and database outages cannot create untracked objects.
The independent scheduled
worker invokes cleanup through its existing secret-protected endpoint:

- Objects must be tracked and at least 24 hours old.
- Live message references, active statuses, and current avatars are retained.
- Orphans, replaced avatars, and deleted/expired message and status objects
  are removed in batches of 20. Forwarded/shared live references retain bytes.
- Storage failures retain the inventory row for retry. Concurrent workers
  use row locks with `SKIP LOCKED`.
- Arbitrary old disk files without metadata are never automatically deleted.
  Inventory/reconcile those separately before applying an orphan policy.

This retention policy preserves live messages indefinitely unless the product's
existing expiry/deletion controls apply. A 24-hour creation grace protects
in-flight uploads; cleanup throughput and worker health must be monitored.
Background images are stored in the conversation row and disappear when
replaced/deleted; they are not separate storage objects.

## Task 5: device sessions and staged CSP

Apply `0036_device_sessions` before deploying. A completed password, Google,
phone, or MFA sign-in creates a database-backed device session. Access JWTs
expire after 15 minutes. The HttpOnly/SameSite=Lax refresh cookie has a 30-day
absolute lifetime by default (`SESSION_TTL_DAYS`, bounded to 1–90 days).
Refresh does not extend that lifetime or reset primary/MFA authentication age.

Next Proxy refreshes an expired access cookie before a page/API request and
forwards the new cookie to the route. Refresh tokens are hashed in PostgreSQL.
Rotations lock the row; concurrent requests using the previous token within
10 seconds receive the same successor. Replay of the known previous token
after this grace period revokes the device. Older generations are rejected;
random guesses cannot revoke a device. Access requests check device revocation
and expiry in the database, alongside suspension, password/logout revocation,
and MFA enrollment. Refresh checks the same account controls.
Already-open realtime streams repeat the uncached eligibility check every
five seconds and close on revocation, expiry, or inability to verify access.

Profile → Signed-in devices lists sanitized browser descriptions and renewal
times. Users can revoke one device or all other registered devices after fresh
authentication. Sign-out retains the existing all-sessions revocation behavior
and clears both cookies. Tokens/hashes are never returned by the device API.
User agents are descriptive and caller-controlled, not verified device identity.

Existing JWTs without a device ID are accepted only until **November 8, 2026
00:00 UTC** and still respect the existing revocation/MFA checks. They appear
as legacy sessions in the UI. Sign in again to register a device. “Sign out
other devices” covers registered sessions; ordinary logout also invalidates
legacy tokens. Review this fixed migration deadline before releasing much later.

Page requests receive fresh server-generated script nonces. The root layout is
dynamic so Next's framework scripts and the theme initialization script receive
the nonce. The policy includes `strict-dynamic`, permits WASM compilation for
encryption, and allows existing Firebase/reCAPTCHA, private Blob media, and
HTTPS images. Inline styles remain allowed for the app's dynamic CSS values.
General JavaScript eval is permitted only in development.
Shared client validation schemas use Zod's
[jitless configuration](https://zod.dev/compile#content-security-policy)
before schema creation, so its eval probe does not generate CSP violations.

The default is `CSP_ENFORCE=0`: the existing baseline policy stays enforced,
and the stricter nonce policy is report-only. `/api/security/csp-report` accepts
bounded, rate-limited reports and logs only known directive names, with no URLs,
query strings, samples, cookies, identifiers, or IPs. Treat these reports as
untrusted operational signals. Set `CSP_ENFORCE=1` after validating actual
Google/Firebase, native, PWA, media, and encrypted-chat flows in staging.
The automated lab verifies enforcement on local password-account pages; it
does not verify external providers or real native devices.

## Task 6: mobile performance evidence

The captured six-page/width sample and profiling conclusions are in
[the mobile lab baseline](./ITEM6_MOBILE_BASELINE.md).

Append `?profile=1` to a page on a test account. Measurements stay in a bounded
500-entry `window.__circloPerformance` array in that browser; nothing is sent
to an analytics service. It includes Web Vitals and supported main-thread long
tasks. Use a build made with `PROFILE_BUILD=1` for React Profiler timings.
Production builds normally leave profiling disabled.

`npm run profile:mobile` accepts `PROFILE_BASE_URL` on localhost/127.0.0.1
only. Install its browser with `npx playwright install chromium`. It measures
360px and 412px layouts with 4× CPU throttling, 80ms latency, and 1.6Mbps
download speed. The integration suite also profiles an authenticated profile
and seeded 500-message conversation, checks browser errors, CSP enforcement,
horizontal overflow, and records screenshots. Artifacts live in ignored
`.freebuff/performance/`; CI retains the JSON reports.
Each width starts with a fresh browser context; subsequent routes reuse its
asset cache. The two contexts use Dubai and New York time zones. Chat timestamps
and grouping first render consistently in UTC, then switch to the browser's
local time after hydration; this avoids server/browser time-zone text mismatches.
The Web Vitals collector uses the official `web-vitals` library with live updates
and keeps the latest value for each metric, including CLS and INP when observed.

The conversation-list/history APIs provide bounded `Server-Timing` values
for authenticated data loading. The integration suite captures a real
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` history query on the disposable
fixture database in `database-lab.json`. These timings are operation/query
measurements on local fixtures, not production load evidence.

Lab results are single samples, not field p75 scores or real-phone benchmarks.
For release acceptance, collect multiple cold/warm runs on actual Android/iOS
devices, exercise typing, scrolling, encrypted message receipt, voice recording,
background/resume and keyboard changes, and compare LCP/INP/CLS and React/SQL
timings before choosing further optimizations. Export only timing records from
test accounts; do not share production message data or browser storage dumps.

## Verification

Build first, then run tests sequentially; do not rebuild while a test server runs.
The new integration script drops/recreates **only** a loopback database named
`items456_quality_test`. Set `ITEM456_TEST_DATABASE_URL` accordingly, using a
disposable PostgreSQL role with database-creation rights. It launches a real
production server on loopback port 3110, with providers disabled and fake accounts.

```powershell
$env:PROFILE_BUILD='1'
npm run build
npx playwright install chromium
$env:ITEM456_TEST_DATABASE_URL='postgresql://test_role:test_password@127.0.0.1:5432/items456_quality_test'
$env:ITEM456_BROWSER_TESTS='1'
npm run test:items4-6
```

The integration scanner is a controlled clamd protocol fixture for clean,
infected, and failed replies; it is not evidence of real antivirus detection.
CI separately runs `npm run test:scanner` against an actual ClamAV service,
checking harmless bytes and the standard in-memory EICAR test signature.
Locally that check requires a running isolated scanner; it does not silently skip.

CI still runs strict lint, types, dependency audits, production build, and
all account/deployment/authorization suites. New tests cover content spoofing,
scan failure, background bypass rejection, malformed status recipients,
retention preservation/retry, short access expiry, concurrent rotation,
refresh replay, cross-user/CSRF revocation boundaries, logout, nonce uniqueness,
framework nonce propagation, CSP reporting, and authenticated timing headers.
Deployment, production migrations, hosted CI, real scanner execution, and
external-provider/physical-device QA require their respective environments.
