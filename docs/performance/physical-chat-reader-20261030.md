# Physical first-chat investigation — 30 October 2026

Phone: Poco X7 Pro, retained account/data/HTTP cache. Optimized release APK with explicitly enabled local profiling; server remained `speed-8884826`. No message contents, account IDs, session values or keys were recorded. The owner's normal Play candidate remains a separate artifact.

## Actual live-build baseline

Measurements start at pointer-down in the hosted inbox. The target was the most recently saved chat selected by local metadata after the owner confirmed a current text message, rather than assuming the first row contains text. “Opening surface” refers to the temporary reader; it does not prove a persistent plaintext snapshot existed.

| Run | Opening-surface text | Full chat text | First readable text |
| --- | ---: | ---: | ---: |
| Initial valid sample | 223ms | 794ms | 223ms |
| Repeat 1 | not observed | 723ms | 723ms |
| Repeat 2 | 265ms | 610ms | 265ms |
| Repeat 3 | 840ms | 1,354ms | 840ms |
| Repeat 4 | not observed | 2,293ms | 2,293ms |

Repeat 4 independently captured the packaged chat list's painted frame **574ms from the launch command**, while the hosted inbox was observed at2,165ms. These are different surfaces. Activity-draw time is not a message/list readiness measurement. The live build does **not** meet a consistent one-second first-message maximum.

Earlier “first chat” text-timer timeouts were invalid as text timings: that page had an expired row, three media rows and a deleted row. The first saved histories contained no eligible persisted text. Do not cache disappearing/expired bodies to make this benchmark pass. Network request wall times in the first probe had a host/phone clock offset; subsequent probes use the phone's clock. DOM-relative pointer timings are unaffected by that offset.

## Confirmed paths and staged fixes

1. `src/components/chats/chats-layout.tsx`: a selected preview could remain behind stalled background preview work. Pointer-down/focus now prioritizes local-only decryption of the authorized summary; no peer/key API is added. A regression stalls background work and API responses and still obtains the selected readable text.
2. `src/components/native-app-bridge.tsx`: same-account auth refreshes could rotate cookies without renewing the local startup binding because the effect depended only on status and account ID. It now tracks the refreshed authenticated user object. Tests cover renewal, switching and logout; server authorization remains separate.
3. The packaged startup view previously rendered only persisted eligible plaintext. If none existed, reading waited for the full hosted app. `src/lib/startup-chat-reader.ts` now reuses the same existing RSA/AES primitives and local v2 identity to read/decrypt one **fresh authorized** server page. It checks viewer, conversation, membership, blocks, pending requests, deletions and expiry. It performs no key registration/sharing/history retrieval or plaintext persistence. Missing material defers to the full client.
4. Fresh disappearing text uses `initial.serverNow`, the entire round-trip allowance and a monotonic deadline. Self-destruct content is excluded. Expiry, backgrounding, lock/account changes and fresh denial clear the temporary message surface. The startup CSP permits only same-origin connections; an actual browser regression verifies cross-origin requests are still blocked.
5. Local key unlock is warmed only after the cached list's painted frame. Initial eager-unlock prototypes logged1.39–2.59s activity-construction-to-list frames during early DevTools probing; those are not accepted after-results. The final deferred-unlock candidate needs its own physical result.

## Validation and remaining gate

-211 unit tests passed, including seven actual-crypto startup-reader cases: authorized decrypt, wrong account/conversation/membership/request restrictions, expired/deleted/hidden/self-destruct exclusion, conservative server deadline, missing server-clock rejection, mid-request account change and missing/corrupt local material.
- Actual browser tests passed for fresh encrypted response decryption, server reconciliation, no ephemeral disk persistence, background/expiry removal and403 cleanup; the original cache-only startup test still passes without network.
- TypeScript and targeted ESLint passed. Android release unit tests and both profiling/normal builds passed; normal-build profiling is disabled.
- The direct raw DevTools timing command was rejected by automatic approval review with only “blocked by policy.” It was not retried through another route. A profiling-only, elapsed-time-only native marker supports a manual tap check instead.
- **Final physical after-result pending.** Do not call the one-second goal complete, extrapolate a maximum from a small sample, or report these APK-only changes as a Bluehost deployment. The existing active-protocol authentication limitations remain in the separate security ledger.

## Owner's manual check and next local-read fix

The owner confirmed opening and tapping the updated profiling APK. The available marker recorded **1,090ms from activity construction to the cached-list frame**. No tap-to-text marker was emitted, so this is not a successful chat timing and does not meet the requested maximum. The normal, non-profiling reader test APK was restored with `adb install -r`; data and keys were retained. Its native activity draw was912ms, which must not be reported as usable-list speed.

The following code change removes an actual serial disk step: `offlineChats()` now reads contacts and previews using one IndexedDB connection and one local-key lookup, with independent reads in parallel. Existing authenticated record encryption, damaged-record handling, locks and account isolation remain. The browser regression confirms one database open, correct rows and preview, plus the existing authorization/expiry/logout tests. This is an operational improvement; a sub-second physical after-timing is not inferred from it.
