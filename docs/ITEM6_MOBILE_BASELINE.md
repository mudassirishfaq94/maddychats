# Task 6 mobile lab baseline

Captured: 2026-10-08T21:51:15.526Z (UTC). Node 22, Next 16.3.8, Chromium, production profiling build.

Single sample per page/width on local fake accounts, not field p75 or a physical-phone benchmark. CPU 4x; 80ms latency; 1.6Mbps download. A fresh browser context is used per width, with asset cache reused between routes. 360px uses Dubai time; 412px uses New York time.

| Width | Page | LCP (ms) | INP (ms) | CLS | Max React commit (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| 360 | `/app` | 1368 | 200 | 0.012 | 33.7 |
| 360 | `/app/profile` | 976 | 112 | 0.000 | 127.1 |
| 360 | `/app/chats/:id` | 1032 | 224 | 0.000 | 399.6 |
| 412 | `/app` | 1680 | 80 | 0.012 | 60.4 |
| 412 | `/app/profile` | 820 | 72 | 0.000 | 47.1 |
| 412 | `/app/chats/:id` | 1200 | 136 | 0.000 | 123.2 |

All six combinations had no JavaScript page errors, enforced CSP violations, or horizontal overflow. The chat fixture contains 500 messages; history remains paginated. Core metrics were captured with the official web-vitals library and React commits with the profiling renderer.

The 360px overview interaction has exceeded 200ms in some repeated diagnostic runs (216–248ms). Prioritize a real-phone Chrome Performance trace of that interaction and startup work. Chat initialization also produces long tasks and large React commits in this throttled lab; attribute those costs to hydration, initialization, or crypto before choosing component splitting or memoization. These measurements do not identify a proven production bottleneck by themselves.

The lab uncovered server/browser time-zone hydration mismatches and Zod eval-probe CSP violations; both were corrected and the browser checks now guard against regressions.

The companion `database-lab.json` captures EXPLAIN ANALYZE/BUFFERS of the bounded history query on the disposable local fixture. It is a single query sample, not evidence of production database throughput. Raw timing JSON and screenshots remain in ignored `.freebuff/performance/`; CI uploads the JSON reports.

Physical Android/iOS, external Google/Firebase/native/PWA workflows, and production load measurements remain release-environment checks. See [the implementation and verification guide](./ITEMS4_6_HARDENING_AND_PERFORMANCE.md).
