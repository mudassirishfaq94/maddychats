# Frontend audit validation and implementation

Base: `1715dc73084d002b444321c5c747d6a5f5b5a04b`. The supplied report is a set of hypotheses; its baseline timings, FPS, CPU percentages and predicted savings do not include reproducible measurements and are not treated as results.

## Confirmed and addressed

- **Growing loaded history:** the server initially supplies a page, not the entire database history, but repeated older-page loads accumulated mounted rows. A measured TanStack Virtual window now takes over above 60 loaded messages. Stable message IDs/end anchoring preserve prepends; programmatic jumps mount offscreen targets; playing media, open portalled viewers and the editing row remain mounted. Normal small pages retain server-rendered HTML. Parent follow-latest behavior remains authoritative.
- **Row work during unrelated state updates:** extracted a module-level memoized message renderer. Every render input is explicit, handlers read committed state through a stable ref, and the normal full shallow comparison observes edits, reactions, receipts, replies, expiry, queue state, trust errors and theme/account changes. The report's partial custom comparator was not used because it omits visible state.
- **Presence fan-out:** connection/subscription context no longer contains presence. An external store suppresses identical heartbeats; the active chat selects only its peer's stable snapshot. Presence is cleared on account/stream teardown. Lists subscribe independently.
- **Encryption context identity:** memoized the complete existing hook result. Key generation, trust verification, recovery, authorization and cipher formats remain unchanged. Also replaced the repeated per-batch message lookup with an ID map to avoid quadratic lookup work while applying decrypted results.
- **Timer wakeups:** call polling now owns an interval only for an open call or visible disconnected-SSE fallback; active call heartbeats are retained. Offline retries and cooperative scheduled-message timers stop while hidden and resume on visibility. Server-side scheduled delivery remains independent of open browser pages.
- **Optional WASM startup:** existing Signal registration was asynchronous and not a paint gate. It now waits for an idle slot (bounded three-second deadline; cancellation on account teardown), while retaining device discovery/prekey behavior. Loading only after an established v2 session could break initial recipient discovery, so that recommendation was not followed.
- **Animation picker:** still posters are the initial preview, with one animation on hover/focus and reduced-motion posters retained. Six preview GIFs were converted to animated WebP while retaining all 12 frames, delays, dimensions and looping. Combined bytes fell from 173,040 to 146,072 (26,968 bytes, approximately 15.6%). Original upload formats and older asset URLs remain available. These picker assets were already deferred and were not part of initial chat loading.

## Claims corrected; no speculative rewrites

- A client boundary does **not** disable initial SSR or make server-rendered children client modules. The pinned Next.js guidance explicitly describes server prerendering of client components and interleaved server children. Authenticated page fetching/auth checks and the persistent shell remain intact.
- WebCrypto returns asynchronous promises. The report supplies no trace demonstrating synchronous AES/RSA frame blocking. Introducing a separate private-key worker protocol without such evidence would add key transfer/lifecycle/security complexity; crypto primitives and storage were not migrated.
- `font-display: optional` has a short block period followed by fallback; it does not cause indefinite invisible text. Theme initialization prevents an incorrect-theme flash. Neither was changed based on unsupported multi-second estimates.
- The old two-second call timer already skipped network requests while SSE was connected and no call was active; the change eliminates the no-op wakeups and preserves disconnected fallback, rather than removing incoming-call recovery.
- The report's claimed fixed FPS, percentage speedups and physical-device latency are not established by code inspection. Android traces and defined-network measurements are still required for device sign-off.

## Regression coverage

- Presence snapshot identity/deduplication and account-store isolation.
- Conditional interval pause/resume and duplicate-timer prevention.
- Preview frame/timing preservation and actual byte reduction.
- Real-browser component test with 1,100 messages: bounded DOM, offscreen jumps, keyed prepend anchoring, dynamic heights and active audio/open portalled viewers retained across scrolling.
- Extended existing encrypted-chat browser workflow: multiple older-page loads must activate windowing while keeping fewer than 60 mounted message rows; existing follow-latest, touch, resize, deep-link, image, audio, encryption and account checks remain.
- The mobile stress test measures loaded history independently from mounted rows, exhausts pagination and checks that the oldest database message is reachable. A virtualized DOM must remain below 60 rows. The history count attribute exposes only the loaded count, not message contents.
- The browser fixture also verifies that crossing from 50 normal rows into a virtual window preserves the exact playing audio element. Browser scroll anchoring is disabled on the messages viewport so it cannot compete with the virtualizer's anchoring.
- Participant verification waits for asynchronous fingerprints to render before comparing every value against independently generated fixture identities; no trust assertion is removed.

Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:virtual-history`, and the production reliability/Quality workflows. The browser fixture is built only by a development script; no unauthenticated product route or database fixture is shipped.

References: pinned `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, pinned Script/font guidance, and [TanStack Virtual chat guidance](https://tanstack.com/virtual/latest/docs/chat).
