# Android performance implementation — 2026-10-21

Base: 7341141ede32971d51558d5837dd3fe00ff27fac. Target: Circlo Android hosted WebView, currently 0.9.9.

## Execution order

1. Repair active native cache handling and canonical launch routing; correct authenticated avatar loading.
2. Deduplicate conversation reads; batch verified-message storage; remove cache scanning from decryption readiness; reuse unchanged protected private-key envelopes and deduplicate local key restoration.
3. Gate attachment work on viewport/user intent, bound download concurrency and blob retention, preserve revocation/expiry/account isolation.
4. Keep the shared application shell mounted across tabs, overlap Status code/data loading, defer unopened controls and isolate message-row rendering.
5. Reduce proven database round trips without weakening authorization, expiration, device trust or message-request boundaries. Add meaningful regression coverage.
6. Run lint, types, unit/security/integration/browser suites and Android compilation/JVM tests. Report measured results separately from physical-device targets.

## Acceptance

- No unconditional WebView resource-cache deletion on launch.
- No encryption downgrade or trusted-key replacement.
- Account changes and logout cannot reuse another account's private requests/media.
- Current server authorization and expiration remain authoritative.
- No eager encrypted-file downloads, bounded media concurrency and memory.
- Freshness reconciliation on SSE reconnect and missed events remains available.
- Existing API consumers remain compatible.
- Warm-tab surface target <100 ms, readable warm chat 100–200 ms, fresh chat <500 ms p95 on a defined test network. Targets are not measured claims.
- Physical signed-APK startup/readability/frame measurements remain necessary; CI browser emulation is not Android field evidence.

## Verification environment

Local shell and Node runtime initialization are unavailable in this Codex session. Changes are staged through the GitHub connector on an isolated branch and validated by repository GitHub Actions. Production configuration, paid plans, secrets, signing identity and deployment are outside this implementation's mutations.

## Progress

- [x] Source-wide inventory and focused review.
- [x] Isolated implementation branch.
- [x] Confirmed native and image defects.
- [x] Shared reads, encryption and IndexedDB.
- [x] Media scheduling and lifetime.
- [x] Navigation and rendering.
- [x] Database changes supported by regression evidence.
- [ ] CI verification and final review.
- [ ] Physical-device signed-release verification (requires release environment).

## Evidence discipline

Do not repeat the earlier Android report's estimated percentage improvements as results. The active native launcher differs from the unused Compose implementation. Cloudflare TURN is a calling dependency; Render plan/region/deployed SHA require live verification before infrastructure changes.

## Implemented changes

- Native: retain WebView HTTP resources, open the canonical Chats route, reuse the existing document for notification navigation when its router bridge is available. Remove the unused Compose UI and its incompatible compiler dependencies. Version 0.9.10 (19).
- Startup: retain server-authenticated initial user state, share account-scoped conversation reads, keep the application shell mounted, and avoid reconnecting SSE for unchanged account identity. Reconcile list state on reconnect and persisted events.
- Encryption: reuse unchanged protected key envelopes, deduplicate local conversation-key restoration, and batch authenticated IndexedDB reads. Optional decrypted-cache hydration no longer gates normal decryption. Trust and server authorization gates remain.
- Media: two concurrent downloads/decryptions, viewport-driven previews, file/audio intent loading, reference-counted shared requests and 32 MiB/64-entry idle-resource budgets. Active playback resources are retained until released; deletion, expiry and account cleanup invalidate resources.
- Rendering: overlap Status code/data loading, warm navigation on intent, defer unopened controls, memoize text rendering and reuse unchanged sidebar decryptions. Authenticated avatar requests keep session cookies by bypassing the server image optimizer.
- Database: read-time expiration masking without cleanup writes; indexed per-conversation latest-message lookup. Existing pagination contracts and membership checks remain.
- CI: remove the invalid root gitlink that blocked checkout; preserve the enforced full-history secret gate and record only exact reviewed historical false-positive fingerprints.

## Remaining release evidence

Use the user's Poco X7 Pro with USB debugging and a release APK signed by the existing application identity. Record Android and WebView versions, deployed server SHA/region/plan, network RTT and account history size. Do not compare different server revisions.

1. Measure repeated force-stop launches, separating first-ever resource download from retained-cache launch. Record process start, first visible shell and first usable conversation list separately.
2. Record first open and repeat open for text-only and media-heavy chats; measure first readable decrypted message separately from the composer appearing.
3. Record at least 30 warm tab transitions and report median/p95. Capture frame stalls with Android Studio System Trace or Perfetto; repeat after scrolling media-heavy history and check memory retention.
4. Exercise offline launch/reconnect, logout/account switch, expired attachments, notification taps, incoming/outgoing calls and restored encryption keys.
5. Investigate Render cold starts, database pool/region latency or Cloudflare TURN only when traces identify them. Infrastructure changes require live configuration evidence; TURN affects call media, not ordinary tab rendering.

A browser CPU/network emulation and Android compile are regression evidence, not proof of signed-device latency. Full row virtualization, avatar thumbnail migration, conversation-list pagination and hosting changes remain candidates requiring profiling rather than confirmed fixes in this patch.


## Recorded verification

Code revision: a9d3307758345e23ab228d665264994a4f08c7d5. [Messaging reliability run](https://github.com/mudassirishfaq94/maddychats/actions/runs/39505677334) passed both browser/database and Android jobs.

- Lint, types, production build, 126 unit tests and 15 reliability integration tests passed.
- Real browser workflows passed E2EE messaging, trust, expiration, scheduled messaging, encrypted image/chunk upload, on-demand encrypted document, recovery, WebRTC, simulated Android push bridge, mobile navigation, account isolation and offline delivery.
- Controlled Chromium production-build warm-navigation measurements (8 samples per condition, rounds after first): normal paint median 46 ms/p95 49 ms, usable p95 49 ms; 100 ms HTTP latency +4x CPU slowdown paint median 142 ms/p95 189 ms, usable p95 272 ms. These summarize Status, Settings, Chats and chat-composer availability. They do not measure first readable-message or physical APK startup latency and are not a statistically robust field benchmark.
- Shell DOM persistence and server-authorized current chat-history requests were asserted during navigation. Logout/back prevented private prefetched content reuse.
- Android job compiles and runs JVM tests with a compilation-only Firebase fixture. It does not create or validate the production-signed release.
