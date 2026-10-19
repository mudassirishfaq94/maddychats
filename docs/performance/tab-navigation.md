# Tab and chat navigation

## Changes

- Explicitly prefetch the full authenticated tab routes. Next.js otherwise skips
  full prefetching of these dynamic pages, adding a server round trip on taps.
- Use `/app/chats` for the Chats navigation and home link, so opening/closing a
  conversation shares the existing chat section layout instead of replacing it
  with the separate `/app` alias. Existing entry URLs remain supported.
- Warm the chat JavaScript after initial rendering and on pointer/focus/touch
  intent. Do **not** prefetch full chat pages: message history, membership and
  expiration timestamps must come from the current authorized server request.
- Refresh the conversation list in the background on entry/reconnection, and
  retain its existing debounced realtime updates. Other tabs retain their fresh
  API reads. No private data is added to persistent caches or a service worker.

## Local measurements (2026-10-19)

Chromium, production build, 390 x 844 viewport, isolated localhost PostgreSQL.
The mobile simulation adds 100 ms HTTP latency and a 4x CPU slowdown; this is
not a physical Android measurement. Timings start at the actual click and end
after two animation frames with the destination visible. Chat readiness waits
for the enabled composer after a fresh history request; Status readiness waits
for its fetched feed, separately from the heading appearing.

Core routes: Chats, Status, Settings and opening a chat. Three rounds per
condition, with the final two rounds summarized (eight warm samples). Calls,
People and Communities are additionally checked twice per condition. Small
samples are useful regression evidence, not population latency guarantees.

| Condition | Before median / p95 appearance | After median / p95 appearance | After p95 usable |
| --- | --- | --- | --- |
| Fast local connection | 87 / 153 ms | 36 / 72 ms | 72 ms |
| 100 ms latency, 4x CPU slowdown | 631 / 811 ms | 286 / 378 ms | 516 ms |

The slower readiness case is the fresh Status fetch. Calls/People/Communities
appearance measured 33–53 ms locally and 101–182 ms in the mobile simulation.
Full chat-route caching was deliberately rejected despite faster synthetic
results because it can retain old messages and server-clock snapshots. A
loading boundary was also rejected because its fallback delay worsened chat
readiness. The final implementation fetches current chat history on each open.

## Verification and limits

- Production build/type checks, targeted ESLint and 117 unit tests passed.
- The actual browser workflow passed 36 measured navigations, fresh chat
  requests, sign-out, browser Back isolation and server session rejection.
- CI repeats the workflow and uploads raw `navigation-latency-*.json` artifacts.
  It enforces a 500 ms normal-loopback p95 regression budget, distinct from the
  desired 100–300 ms user-experience target, to allow runner variation.
- Browser measurements use real components and database fixtures; production
  accounts, keys and conversations are not used. No schema migration needed.
- Cold starts, slow networks, first code downloads, fresh authorization/data,
  large real histories and device load can exceed the target. Physical Android
  and production latency have not been verified for this change.
- No new dependencies, paid services, global auth caching or encryption changes.
