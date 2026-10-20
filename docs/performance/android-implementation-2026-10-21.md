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
- [ ] Confirmed native and image defects.
- [ ] Shared reads, encryption and IndexedDB.
- [ ] Media scheduling and lifetime.
- [ ] Navigation and rendering.
- [ ] Database changes supported by regression evidence.
- [ ] CI verification and final review.
- [ ] Physical-device signed-release verification (requires release environment).

## Evidence discipline

Do not repeat the earlier Android report's estimated percentage improvements as results. The active native launcher differs from the unused Compose implementation. Cloudflare TURN is a calling dependency; Render plan/region/deployed SHA require live verification before infrastructure changes.
