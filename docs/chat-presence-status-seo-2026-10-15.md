# Chat presence, status loading and public search metadata

Typing events were published but never handled by ChatView. The stream rejects expired typing on the server clock (phone clock skew does not
hide live events). The receiver now tracks
individual senders with five-second expiry, including overlapping group typers.
The composer refreshes active typing at most every two seconds and sends idle/clear
updates. Server-generated expiry prevents stale retained SSE events from showing
false typing after reconnect. Authorization, membership, CSRF and blocks remain;
the typing limiter is account-bound (120/minute), avoiding shared-IP exhaustion.
The sender's typing privacy switch is now enforced by the server.

Read receipts previously ignored the profile privacy switch. Reading still updates
private unread bookkeeping, but disabled receipts are sent only to the reader's
own sessions, never other members. Message history filters receipt identities
through the reader's current preference, including existing rows. Re-enabling
receipts makes saved reads visible again. Previously delivered receipts cannot be
retracted from someone else's memory or already-open screen.

Photo statuses previously used lazy loading and their seven-second timer began
before decoding. The viewer requests the visible image eagerly, shows a loading panel and pauses progression
until load. Errors and a 15-second stalled-load deadline offer Retry. Videos use
ready/waiting/playing/error events for the same feedback. View counts begin only
when content is available. No speculative full-size image preloads: private no-store media would otherwise
be downloaded twice. No new shared media cache, service, dependency or fee.

/robots.txt and /sitemap.xml use Next's metadata route conventions. Only the public
landing page, Privacy and Terms enter the sitemap. App, API, authentication,
invitation and migration paths are excluded from crawl guidance. Robots is not
access control; existing session and authorization checks remain authoritative.

Device-linking proposal: retain existing account and cryptographic proof. Offer
Link this device after account authentication, using the existing expiring code
from a trusted browser. Lost-device recovery must verify the original email and
require explicit revocation confirmation. Never delete accounts on a new signup
or reveal account/session existence before authentication. Email recovery cannot
recreate private keys that were lost on every device without a recovery backup.
This release does not change sign-in/session policy or auto-delete accounts.

Verification: production build, lint, 61 unit tests, and restored-workflow browser
suite, including two real browsers for typing privacy/idle expiry, stale SSE
expiry, private receipts across realtime/history, durable unread state, delayed
status media and paused progress. Existing mobile, encrypted delivery, recovery,
media, groups and calls remain regression coverage. Physical Android performance
and OS notification presentation still require a real handset check.
