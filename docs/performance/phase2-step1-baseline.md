# Phase 2 Step 1 performance baseline

This record separates existing observations from measurements made by this change. No physical Android device was attached to the code runner, and this checkout has no application environment file or database credentials. Therefore it does not claim new end-to-end phone, authenticated navigation, or production database timings.

## Existing baseline

The Phase 1 audit measured the Render service in Oregon on the free plan with one instance. Its five-minute samples from 18:24–19:24 UTC on 22 October 2026 showed CPU 0.0021–0.0653 cores (1.4–43.5% of the 0.15-core limit) and memory 116.5–157.2 MiB of 512 MiB. Render returned no HTTP latency or request-count samples. These readings predate the audited `ffddf3b` deployment and were not collected under a controlled workload. The audit and machine-readable evidence were delivered separately from this repository.

The owner's Poco X7 Pro observations were startup 4–5 seconds, first chat 5–6 seconds, and tab changes 3–4 seconds. They were not timed with a trace, and build/network/cache conditions were not recorded. They remain user-reported context, not an instrumented baseline.

## Reproducible local profiling

Use the existing `npm run profile:mobile` script against a local instance only. It emulates 4x CPU slowdown, 80 ms network latency, and 1.6 Mbps download. For authenticated routes, set `PROFILE_COOKIE` and `PROFILE_CONVERSATION_ID` in the shell; set `PROFILE_BASE_URL` for a non-default loopback port and `PROFILE_QUICK=1` for a single profile route. The profiler records only the route family, request category, elapsed milliseconds, status, aggregate browser timings, and fixed-name `Server-Timing` values. It never writes a cookie, raw URL, message, page error text, or conversation identifier to the JSON report. The measurement is a desktop Chromium emulation, not an Android result.

The updated report includes per-route request counts and min/median/p95 durations by fixed API category. Server timing entries are available for the existing conversation-list and message-history endpoints. Missing browser/server samples remain absent; they are not recorded as zero. Repeat with the same local fixture, viewport, session, conversation, and cold/warm cache state for a meaningful comparison. Keep the emitted report local because screenshots may contain application UI.

## Measurements in this step

The focused regression tests use controlled promises. They verify that two concurrent reads in one auth scope issue one underlying load, separate account scopes remain separate, settled notification preferences are fetched again, and an event during a conversation-list request causes one serialized post-event read. These are request-count correctness checks; their sub-millisecond test-run durations are not app performance measurements.

Before/after startup, navigation, chat-visible-message, API latency, and physical-device numbers are unavailable in this environment. No millisecond improvement is claimed. Render metrics should be captured again over the same window and workload after the draft is reviewed and deployed by the owner.
