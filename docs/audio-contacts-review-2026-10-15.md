# Audio calls, private contacts and mobile profile review

## Scope and cost

One-to-one, audio-only WebRTC calls use the existing authenticated application,
Postgres and SSE signaling. Audio does not pass through Render or the database.
No paid service, SMS, relay or new hosting resource is provisioned. Google's
public STUN endpoint assists direct connection discovery; it sees network
addresses. An authorized push subscription can now alert a backgrounded or closed app.
Opening the notification brings the recipient to Circlo to answer; the browser
never opens the microphone or answers without an explicit user gesture.

Direct connections do not work on every carrier, firewall or NAT. This release
has no TURN relay and does not promise universal connectivity. Failed calls have
bounded waits and explain trying another network. Browser microphone and audio
playback permission remain under the user's control.

## Implementation and security

- A phone button appears only for direct chats; the server independently requires
  two accepted members and no block in either direction. Groups are excluded.
- Answer, decline, mute/unmute, hang-up, busy, permission-denied, unanswered and
  connection-failure states are implemented. Connected controls collapse so the
  message composer stays usable. Navigation within the app preserves a call.
- Fresh authentication, same-origin mutation checks, bounded/schema-validated
  audio-only SDP, per-user read/write/invite limits and parameterized SQL apply.
- Stable-order account advisory locks prevent simultaneous cross-calls. The
  call transition and its SSE wake-up commit together.
- A random per-browser control capability is never returned by the API. Only
  the answering browser can control an answered callee leg. An unrelated account
  cannot read, answer, hang up or heartbeat another call.
- A ringing invitation expires after 45 seconds. Active calls require both
  browsers' heartbeats, not just one browser indefinitely extending the other.
- Tracks stop and the connection closes on cancellation, failure, hang-up or
  provider teardown. Page exit sends a best-effort end beacon; expiry handles
  abrupt exits. Ended SDP is deleted immediately; expired rows are inaccessible
  immediately and removed on subsequent mutations or existing maintenance.
- WebRTC encrypts audio using DTLS-SRTP. Signaling is authenticated over HTTPS.
  This release does **not** bind call fingerprints to chat safety numbers and
  must not be described as independently safety-number-verified calling.
- Direct peers can learn each other's network address. The incoming-call card
  explains this before acceptance. Audio is not recorded. Incoming-call notification
  metadata (participants, conversation/call IDs and timestamps) is retained under
  the existing notification lifecycle; SDP and audio are not stored in notices.
- Idle browsers do not poll: initial/reconnected SSE, focus and online events
  synchronize incoming calls. Open calls check state every two seconds and
  heartbeat every 15 seconds. Stable context values avoid repeated chat renders.

## People and phone discovery

The empty search previously returned the newest registered accounts. It now
shows only explicitly saved, one-way contacts. Searches require two characters;
names and usernames use literal, case-insensitive matching. Wildcards are escaped
and blocked accounts are excluded. Add/remove actions affect only the owner.

Profile now accepts a user-provided international phone number without SMS.
It is stored separately in `contact_phone`, labelled unverified and never used
for authentication, account recovery or proof of identity. Discovery remains
explicitly opt-in and exact-match only; numbers are not returned in public
results. Verified legacy phone identities remain separate. A supported browser
can let the user select particular device contacts; only their selected phone
numbers are matched, up to ten unique numbers per selection, with two concurrent
requests. Local numbers require an explicitly chosen country calling code.
Unsupported browsers retain manual name, username and phone search.

Contacts and owner phone preferences are included in account export and cascade
away on account deletion. These new private tables use deny-by-default RLS for
public API roles and the existing restricted server-role grant process.

## Migration and rollback

`drizzle/0046_contacts_audio_calls.sql` adds the two private tables and nullable
verified phone/opt-in fields. It does not rewrite chats, messages, devices or
encryption keys. Indexes serve owner contact lookup, current/busy calls by either
participant, expired signaling cleanup and opted-in exact phone discovery.

To roll back, deploy code without these features first, then drop `audio_calls`,
`user_contacts`, `users_discoverable_phone_idx`, `users.verified_phone` and
`users.phone_discoverable` using the migration owner. This loses saved contacts
and phone discovery preferences, so export them before rollback if needed.
Leave existing message/encryption tables unchanged. Reconcile the migration
journal/ledger as part of a reviewed rollback rather than editing a live ledger
while the new application is running.

## Verification

The local production build was exercised with two separate Chromium browser
contexts and fake microphone hardware, using real WebRTC offer/answer, ICE,
DTLS and received audio RTP bytes. No WebRTC connection was mocked. Local setup
took approximately 3.7 seconds in the initial expanded test, including ICE.

`AUDIO_ONLY=1 npm run test:restored` uses only an explicitly checked loopback
database and fake users. It covers answer/decline, busy/cross-calls, mute/unmute,
remote audio, hang-up, microphone release, persisted SDP deletion, unrelated
account authorization, CSRF, hidden control capabilities, blocked users, pending
requests, microphone denial, private contact isolation, phone opt-in/out and the
People add/remove/search UI. Profile layout checks include expanded settings and
maximum-length names/bios at 320, 390, 844-landscape and 1280px widths.

Physical Android/iPhone heads-up presentation and distinct carrier networks
are not verified by browser emulation. No production load test is performed.

## Notification and mobile group follow-up

A visible app shows a temporary in-app banner for another conversation, and stays
quiet for the conversation already being read. Background/closed windows use the
existing push infrastructure. Incoming-call notifications contain opaque IDs;
the worker resolves caller information through the authenticated delivery API.
That API checks recipient, current ringing state, expiry, accepted membership,
blocks, mute/archive state and notification preferences. Answered/ended calls
withdraw the web notification; offline delivery never invents a ringing call.
Tapping opens the exact conversation; Decline is independently authorized.
Android controls permission, battery restrictions and heads-up presentation, so
an application switch cannot guarantee a system pop-up. Native APK publication
is separate from deploying this PWA.

Mobile chat lists now expose labelled New chat and New group buttons. Group
headers include an explicit settings button, and the existing owner/admin editor
appears before the member list. Existing server permission checks and encrypted
roster/key handling are retained. Initial photo-upload retry reuses the created
group rather than creating duplicate groups; previews release their object URLs.

There is no application daily/monthly minute quota or maximum connected-call
duration. Calls are currently one-to-one, one concurrent call per account, with
eight invitation attempts per minute and a 45-second unanswered timeout.
Connectivity, hosting resources, browser restrictions and STUN availability still
limit practical use; no free TURN relay or unlimited capacity is promised.

Migration `0047_contact_phone.sql` adds only the optional contact phone and changes
the existing opted-in phone index to the queried coalesce expression. To undo,
first deploy the prior code, then drop users_discoverable_phone_idx, recreate its
0046 definition on verified_phone WHERE phone_discoverable, and drop contact_phone.
Export user-provided numbers before rollback; reconcile the migration ledger in
a reviewed maintenance operation. No message or encryption keys are rewritten.


Follow-up verification: production build, zero-warning lint and 61 unit tests
passed locally. Two-browser real audio, phone save/opt-in/contact selection,
foreground message navigation and private account isolation passed. The actual
Chromium worker presented a live incoming-call notification with all app windows
closed and withdrew it after answering. Mobile group creation, photo failure and
retry without duplicate groups, direct settings entry, persisted group edits and
removed-member key exclusion passed. No physical-phone OS presentation or carrier
connectivity claim follows from these browser checks.
