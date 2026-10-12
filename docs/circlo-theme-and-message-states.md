# Circlo theme and encrypted message states

Dark mode uses charcoal #151719, graphite #1E2126, incoming slate #24272D,
outgoing muted plum #343042, copper actions #C9A77B, off-white text #ECEAE6
and secondary text #A9A8B3. Light mode uses warm ivory and pale plum. The
wallpaper is plain; the existing vector logo, favicon and rendered PWA icons
use the same palette. Voice controls use their own action foreground rather
than borrowing the outgoing-message foreground for an incoming play button.

Encrypted text displays “Loading your message, please wait…” while local
decryption runs. Authenticated plaintext replaces the placeholder automatically.
After two unsuccessful attempts, the message offers a manual retry and Security
& recovery, with guidance for interrupted loading or unavailable device keys.
Initialization errors direct users to Profile > Encryption devices. Signal
placeholders explain that the device has not received its secure copy. A loading
placeholder becomes actionable after 30 seconds instead of spinning indefinitely.
Unavailable historical keys are never claimed recoverable without a retained
trusted-device copy. Raw errors and ciphertext are not rendered or copied.

Automatic text/reply decryption retries are bounded; history changes do not
silently restart permanently failed messages. Explicit retry re-enables attempts
for the selected message. Existing crypto, trust, device approval, authorization,
encrypted storage and sending behavior remain enforced.

Verification: production build/types and targeted lint passed; all 21 unit tests
passed. The complete isolated production-browser workflow passed, including an
unreadable encrypted fixture with actual retry/recovery controls and no ciphertext
exposure, normal encrypted delivery, device approval/recovery/revocation, encrypted
draft reload, CPU-throttled typing, 320/360/390/412px mobile layouts, attachments,
voice contrast/playback, scheduling and photo statuses. Browser errors and mobile
overflow: zero. Dark/light mobile login previews were visually inspected.

Color calculations: outgoing message text 10.61:1, secondary outgoing text
5.43:1, copper button labels 7.79:1. Browser voice-control contrast remains tested
against its actual bubble. These tests are Chromium lab checks, not certification
on every physical mobile device.

First-contact requests use the recipient acceptance state, separate from the sender awaiting-approval state. The production-browser request test passed: offline sender waiting explanation, automatic decryption after real key delivery, approval/reply, queued reload/recovery and exactly three encrypted messages persisted. The expected placeholder assertion was updated to the new copy; existing privacy/delivery assertions remain.
