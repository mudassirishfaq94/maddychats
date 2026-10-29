# Android saved startup and chat handoff — 29 October 2026

## Changes

- Returning, unexpired approved-device session hints select an account's encrypted local snapshot. The APK packages a read-only same-origin startup view; the hosted app still performs normal session, device, membership, block and expiry checks. No plaintext native cache or new encryption format.
- Cached rows include names, previews where safe, timestamps and unread badges. Expiring bodies remain excluded; their temporary prompt is “Open to see messages”, not a repeated disappearing-message label.
- Cached taps reuse the hosted inbox's normal click/pointer preparation when hydrated, rather than reload the document and repeat startup. Snapshot navigation is restricted to UUID chats and three fixed application routes. Logout/account changes clear the surface; normal notifications bypass it.
- Chat controls have local Suspense boundaries. Attachment placeholders preserve space. Older-page loading requires user intent and cannot overlap. Saved messages are bottom aligned with a stable header/composer area.

## Measurements and limits

Poco X7 Pro, installed R8-optimized 0.9.14 local profiling APK, app data retained. Each run force-stops the process. List timing uses the saved-list animation-frame mark plus the device clock. Chat timing below is an observed upper bound using the real WebView's first-row click flow, not a manual finger gesture.

| Run after eliminating the document reload | Launch → saved list | First chat action → observed readable text |
| --- | ---: | ---: |
| 1 | 533 ms | 664 ms |
| 2 | 600 ms | 906 ms |
| 3 | 654 ms | 528 ms |

Before eliminating that reload, the same cached-startup APK recorded 543 ms to list but 2,743 ms to readable text. Earlier hosted-only profiling measured 2,843 ms to observed list (an upper bound, attached after it appeared), and 666 ms to readable text; this is not a precise paired launch baseline.

These runs do not establish a universal one-second maximum. Network-only messages, new accounts, lost local history and disappearing messages have different constraints. No disappearing plaintext was persisted to meet a benchmark. A CDP touch attempt did not open the row; OS touch injection was rejected by Xiaomi's INJECT_EVENTS policy. Those attempts are excluded from successful chat timings.

## Validation

- 187 Node unit tests passed; TypeScript and changed-file ESLint passed.
- 31 Android release unit tests passed; optimized APK assembly passed. Profiling opt-in is rejected for Play bundle tasks.
- Real encrypted IndexedDB startup regression: no API requests, readable saved messages, no disappearing text, read-only controls, Back, lock changes, account switching and logout. Included in quality CI.
- Saved-inbox/provider and decryption-race browser regressions passed, including held HTTP responses and authorization removal.
- Packaged release `speed-69cc0a9` passed real lazy-audio suspension, message-scroll and cached-history regressions before deployment. Its Bluehost readiness/version checks passed; persistent uploads retained.

The installed APK uses the existing local test certificate and profiling opt-in, preserving app data. It is not a Play Store publishing artifact. Build the final signed AAB without profiling and complete release review before publishing.
