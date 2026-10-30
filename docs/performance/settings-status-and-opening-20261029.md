# Settings, backup, Status and saved chat opening — 29 October 2026

Live release: `settings-df04304`, Bluehost. Application source: `df04304`; later commits change regression tests and this report only. PR #73 remains open; deployment does not merge the branch. Previous release `saved-chat-8e69af0` is retained for rollback, with the existing persistent upload mount unchanged.

## Completed

- Removed the header profile menu's duplicate Settings entry. Settings shows one selected panel instead of mounting every section and scrolling to it. Unopened panels do not fetch or initialize backup tools.
- One primary **Save my chats** workflow creates the encrypted archive and opens file saving. Older formats remain restorable under **Use an older backup**. Fixed cancellation caused by refreshing the same account object during collection; account changes still cancel work.
- Status choices render in a body-level portal with a solid, bounded card, contained title/Cancel, focus handling, and directly visible Text/Photo/Video buttons.
- Reuse a current, authorized and already decrypted inbox preview in memory during chat opening. Its deadline uses the server clock conservatively; disappearing text is not persisted. Hidden/cleared messages are excluded from latest-message summaries.

## Verification

- 187 unit tests and 17 isolated PostgreSQL integration tests passed.
- TypeScript, changed-file ESLint and production Webpack build passed.
- Browser regressions passed: inactive Settings panels stay unmounted; same-account refresh during an actual encrypted backup download; cached list/history with a withheld response; unauthorized response reconciliation, locks, account switch and logout isolation.
- Packaged browser/database checks passed: device/code linking and replay rejection, legacy encrypted-file restoration, local archive export/restoration with unchanged device trust, real QR camera capture/cleanup, realtime chat-opening race, and 18 viewport/font/safe-area combinations.
- Video Status passed actual browser selection, scanner, upload, storage, authorized recipient playback and anonymous denial using disposable accounts. The QA container required access to the scanner's Docker network; scanning was never disabled. Temporary test-network access was removed.
- Live Poco X7 Pro, existing 0.9.13 hosted APK: selected Settings panels, single backup entry, opaque Status chooser with four visible buttons and Video picker entry passed. No status was shared to real users. Live `/api/app-version` and health checks passed.
- The already-merged additive migration 0058 was the only pending migration. Applied through Drizzle using a verified direct owner connection; column and unique index verified. No messages, identities or encryption protocol were changed.

## Speed: target not yet met

Force-stop tests retain app data and HTTP cache. These are individual observations, not statistically comparable medians:

| Observation | Old release | New release, first run | New release, repeat |
| --- | ---: | ---: | ---: |
| Android activity launch | 949 ms | 681 ms | 616 ms |
| First real message after pointerdown | 969 ms | 2,318 ms | 1,102 ms |
| Cached readable rows in tapped chat | 0 | 0 | 0 |

The automated list-visible observations include DevTools attachment and are upper bounds, so they are not reported as precise paint timings. A separate live page navigation observed cached inbox rows at approximately 764 ms from navigation, but this is not a force-stop-to-visible measurement.

The first chat's saved history contains 18 disappearing-message markers and 3 deleted-message markers, with no eligible saved plaintext. In a live read-only probe, the cached inbox was available before its fresh server clock/message snapshot; verified plaintext became available around 2,028 ms. Do not persist disappearing messages to manufacture a cache hit. Intermittent phone WebView DNS failures also interrupted testing; measurements taken during those failures are invalid.

Remaining: make first-chat behavior consistently meet the requested sub-second target under these retention rules. The observed results do **not** establish that target. Physical Android file-picker save/restore was not repeated in this pass; encrypted export/restoration passed the packaged browser regression.
