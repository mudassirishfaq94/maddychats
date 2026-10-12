# Mobile performance audit and execution plan

Target: mobile-first Circlo, without changing cryptographic trust or authentication.

1. Capture a deployed production baseline using disposable accounts, 150 valid encrypted history fixtures, real typing at 4x CPU and a 390px baseline viewport; regression tests additionally use touch emulation at 320/360/390/412px. Inspect code across shell, authentication, profile/devices, chat, media, status, navigation, storage and realtime.
2. Remove ordinary draft text from unnecessary chat renders while retaining synchronous authoritative draft refs, delayed durable saving, group mentions, final-character sends, scheduling, IME and queued recovery.
3. Reduce offscreen chat layout/paint with browser-native content visibility; preserve searchable DOM, refs, loading older messages and scroll anchors.
4. Isolate the status progress timer from its viewer, pause when backgrounded or replying and make its modal usable at narrow/short viewports.
5. Fix measured mobile sizing/touch/font issues and verify navigation and forms at 320/360/390/412px and short landscape heights. Avoid unnecessary changes to existing responsive layouts.
6. Run unit/security/integration/browser/production checks, publish only approved web files, deploy the existing free service and repeat owned live measurements. Report measured scope and limitations, never a universal speed guarantee.

Inspection findings so far: the composer defers state by 100ms but ordinary text still updates ChatView and recreates its inline history; durable draft persistence depends on that state. StatusViewer has an 80ms state timer that rerenders media and reply controls. History has memoized grouping but no offscreen rendering containment. Several status controls are smaller than touch targets and its creation modal has no short-viewport scrolling.
