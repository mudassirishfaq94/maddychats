# Expiry, uploads and first-chat follow-up — 29 October 2026

## Confirmed fixes

- New encrypted attachments now receive the conversation's send-time expiry, like text. Existing deadlines are not changed when the timer changes. Server media access still denies expired messages.
- Timer controls invalidate the authorized client route after saving. A fractional early timeout now reschedules against the actual monotonic preview deadline instead of leaving a preview visible indefinitely.
- Status supports photos and videos up to **50 MiB**, consistently across input, processing, multipart and R2 boundaries. Photos are reconstructed within the existing pixel/output limits. Scanner checks, authorization and rate limits remain enabled.
- Removed the unrelated global 400 MiB chat inventory and 50-item Status inventory caps. Per-file and infrastructure limits still apply; uploads are not unlimited.
- Early Android snapshot taps wait for the inbox's normal client navigation handler. Chat code begins warming when the inbox module loads, before provider effects. No key sharing, authorization or history request is bypassed.

## Validation

- 191 Node unit tests; TypeScript; changed-file ESLint: passed.
- 31 Android release unit tests and optimized 0.9.15 profiling APK assembly: passed. Installed in place without clearing account data.
- Real encrypted IndexedDB fixture: saved messages render while history responses are held; account switching, logout, locked chats and authorization removal are covered. Early native taps and unsupported external destinations are covered.
- Packaged disposable-account checks verify text/media expiry while open and after reload, expired media denial, timer UI refresh, five-second reveal, and uploads beyond the removed global inventory caps.
- A real video above 10 MiB passes the phone-sized picker, ClamAV, storage, authorized byte retrieval and browser decode; anonymous access is denied. These tests do not publish content to real users.

## Performance evidence and limitations

Before the cold-path follow-up, the first launch after `speed-9749ed3` measured **636 ms to the saved list and 3,643 ms from first-row action to observed readable text** on the Poco. Several small JavaScript chunks took 1.3–2.3 seconds; captured cryptographic operations were much shorter. The probe attaches after navigation starts, so its crypto trace is incomplete.

These are force-stop tests retaining app data, using an automated real-WebView click, not manual touch. Eligible saved plaintext excludes disappearing, deleted and locked messages. An expired session hint requires fresh server authorization; it must not be loosened to manufacture a faster result. A consistent one-second maximum has not yet been established.

After deploying `speed-81ab763` and installing the matching 0.9.15 profiling APK:

| Run | Launch to saved list | First tap to observed readable text |
| --- | ---: | ---: |
| First after deployment | 904 ms | 1,534 ms |
| Repeat 1, saved surface unavailable | 2,181 ms observed upper bound, no saved-list mark | 486 ms |
| Repeat 2 | 585 ms | 810 ms |
| Repeat 3 | 626 ms | 501 ms |

The first-after-deployment chat improved from 3,643 ms to 1,534 ms in these individual observations. They are not controlled statistical medians or a reliable maximum. That first run still downloaded two changed inbox/layout chunks in 562–666 ms before the client could begin its normal chat request. The phone's first chat has no eligible permanent saved message bodies, so it still needs an authorized network response; disappearing plaintext was not persisted. Keep the above misses visible when assessing readiness.

The packaged release passed the checks above plus real long-history scrolling and the decryption-refresh race before cutover. Bluehost readiness and public version checks passed; uploads remained mounted. PR #73 contains the source; its merge is separate from the explicitly authorized live deployment.

## Static delivery deployment requirement

`Caddyfile` serves only public `/_next/static/` build assets from `/opt/circlo-static/_next/static`, behind the existing Cloudflare TCP-peer guard. Before switching **every** future release, copy that build's `.next/static` tree there, preserving its relative paths. Reject symlinks and same-path/different-byte collisions; publish files atomically with readable file/directory permissions. Retain previous hashed assets for already-open clients. Never copy uploads, environment files, HTML, standalone/server bundles or protected responses there.

Successful static responses use immutable caching; missing assets use `no-store`. Verify a real asset returns 200, a missing one returns 404 without immutable caching, protected APIs still deny anonymous requests, and direct-origin access remains blocked. Keep the previous app image and configuration available for rollback. No production database schema or data migration is required.
