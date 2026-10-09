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
| Median homepage LCP | 1,516 ms | 1,568 ms |
| Individual LCP samples | 2,028 / 1,516 / 1,500 ms | 1,440 / 1,568 / 1,888 ms |
| Requested compressed JavaScript | 162,482 bytes | 150,253 bytes |
| Requested decoded JavaScript | 534,985 bytes | 495,788 bytes |
| CLS / page errors | 0 / none | 0 / none |

Final customer-facing measurements use the ordinary production build with
profiling disabled. Requested JavaScript shrank about 7.5%. The LCP difference
is small relative to run-to-run variation and does not demonstrate a median
loading-time improvement. An exploratory profiling pass reached a 1,172 ms
median; that result must not be treated as the final production comparison.
These small lab samples do not establish field percentiles or universal
speed. Fresh-browser live-site samples were 2,480 / 1,872 / 2,152
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

The root also seeds authentication from the request-scoped, server-validated
safe user, allowing private startup to begin without waiting for a duplicate
client lookup. Mount/focus session revalidation and cookie rotation remain in
place; no cross-request cache, token or password is exposed to the client.

The message textarea paints browser input immediately while related React
updates run as transitions. A synchronous draft reference supplies normal and
scheduled sends, including a last keystroke before the background render.
Programmatic draft changes still update the input. Regression probes cover
immediate Enter, clearing after confirmed delivery and IME confirmation; any outbound
message observed in those probes must remain encrypted.

Conversation rows are memoized with explicit preview/presence props, so
unrelated typing and presence changes do not rebuild every row. Search uses
a deferred filter while the input remains immediate. This retains archive,
unread, favorites and membership behavior without introducing a data cache.

Mobile interaction probes pass, including the same-task final-keystroke send.
Some diagnostic runs measured chat INP at 160 ms on both widths; another run
measured 56 ms and 312 ms, with profile-page INP up to 376 ms. This variability
and the remaining slow cases require real-phone traces and field evidence;
they do not support a universal 10/10 claim. Enabling monitoring keeps the
component tree stable so encryption and realtime providers do not remount.

This branch is not the live deployment. The persistent realtime architecture
still requires the documented always-on host and release QA. A 10/10 live
rating cannot be claimed until deployment and real-device/field measurement.


## Draft and device-recovery follow-up (2026-10-09)

The composer now coalesces derived React updates after 100 ms of input idle
while retaining the immediate DOM value and draft reference. A send clears
only the exact submitted draft after server confirmation. Key preflight and
transport errors preserve it; a later confirmation cannot erase newer input.
Draft storage errors no longer interrupt input, and pagehide flushes the most
recent draft. Clearing all browser storage still deletes local drafts and keys.

Encryption HTTP requests bound headers and response bodies to 15 seconds.
Manual restoration is scoped to the open chat and has a 30-second cancellation
deadline. It preserves historical key order, shares existing keys only with
trusted devices, aborts remaining writes on failure, and reports an actionable
result instead of silently swallowing errors. A browser-wide device ID no
longer excludes another account's key from peer discovery.

Profile now exposes encryption-device fingerprints and approval. The owner
must compare the new device fingerprint and approve from a trusted device.
A two-minute, audience-bound server challenge requires RSA-OAEP decryption
using that trusted device's private key. The token contains the nonce hash,
not the plaintext nonce; proof is single-use, rate-limited and bound to both
immutable public keys and the account. Trust is rechecked when consumed.
Bootstrap and key sharing reject pending devices. No recovery generates a
replacement history key or sends plaintext messages.

Regression coverage includes response-body cancellation, shared-browser
accounts, real RSA approval, forged/replayed/cross-account/revoked-source
proofs, IME input, delayed-send draft races, failed drafts surviving reload,
restore errors releasing the spinner, and a real second-device decryption.
The release must still be promoted and measured on the live runtime before
claiming its speed; local input-to-frame samples are diagnostic, not field INP.
