# Loading and interaction performance plan

The target is consistently fast rendering and responsive interactions while
preserving session validation, encryption, CSP and private-data cache rules.
A numerical 10/10 rating is not an acceptance test or a production guarantee.

1. Capture repeatable cold-browser public-page timings and resource waterfalls.
   Separate connection, server, asset and rendering delays; the earlier single
   9.2-second load is insufficient to attribute a bottleneck.
2. Keep authenticated encryption and realtime providers inside `/app`, rather
   than shipping them with public pages. Keep global authentication, native
   links, update handling and nonce security behavior intact.
3. Remove delayed hero visibility, avoid loading native plugins on ordinary
   browsers, and reuse timestamp formatters on chat rendering paths.
4. Compare the same production builds before/after with throttled Chromium,
   inspect requested JavaScript bytes, and exercise login/theme navigation.
   Run authenticated mobile, authorization, encryption and CSP regressions.
5. Publish reviewable changes and wait for hosted quality/container checks.
   Production requires the previously documented host and release checks;
   never roll an incompatible persistent listener into the existing Vercel host.

Assumption: optimize the current hardened project for its intended always-on
deployment; retain the existing live deployment until release prerequisites
are satisfied.

## Measured results

Three samples per build on the same local production server configuration,
each in a fresh Chromium process with cache disabled, 4x CPU slowdown,
80 ms network latency and 1.6 Mbps download. Service workers were blocked.

| Measurement | Before | After |
| --- | --- | --- |
| Median homepage LCP | 1,516 ms | 1,172 ms |
| Individual LCP samples | 2,028 / 1,516 / 1,500 ms | 2,124 / 1,096 / 1,172 ms |
| Requested compressed JavaScript | 162,482 bytes | 156,414 bytes |
| Requested decoded JavaScript | 534,985 bytes | 516,810 bytes |
| CLS / page errors | 0 / none | 0 / none |

Median LCP improved about 23%; the first server request remained slower and
is included above. These small lab samples do not establish field percentiles
or universal speed. Fresh-browser live-site samples were 2,480 / 1,872 / 2,152
ms; they did not reproduce the previous isolated 9.2-second observation.
Raw resource waterfalls are in ignored `.freebuff/performance/public-speed-*.json`.

Implementation removes encryption/realtime providers from public routes,
defers logout-cache and opt-in monitoring libraries, and loads Firebase's
SDK only when phone authentication begins. Fonts use optional display so a
slow font cannot trigger a late swap of visible text. The landing hero is
immediately visible. Shared timestamp formatters avoid constructing Intl
objects repeatedly during chat/list renders. Native deep-link plugins load
only in the native runtime and dispose late listeners correctly.

The public browser regression exercises theme selection and login navigation
under enforced CSP, rejects private-chat bootstrap requests, and enforces a
550 KB decoded JavaScript budget. It also caught a landing header stacking
bug: the hero intercepted clicks on the theme menu. The header now layers
above the hero so theme options remain usable.

This branch is not the live deployment. The persistent realtime architecture
still requires the documented always-on host and release QA. A 10/10 live
rating cannot be claimed until deployment and real-device/field measurement.
