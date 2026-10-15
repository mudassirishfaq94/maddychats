# Audio calls, private contacts and mobile profile review

## Scope and cost

One-to-one, audio-only WebRTC calls use the existing authenticated application,
Postgres and SSE signaling. Audio does not pass through Render or the database.
No paid service, SMS, relay or new hosting resource is provisioned. Google's
public STUN endpoint assists direct connection discovery; it sees network
addresses. Both people must keep Circlo open. A suspended/closed mobile browser
cannot reliably receive a call with this implementation.

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
  explains this before acceptance. There is no recording or retained call log.
- Idle browsers do not poll: initial/reconnected SSE, focus and online events
  synchronize incoming calls. Open calls check state every two seconds and
  heartbeat every 15 seconds. Stable context values avoid repeated chat renders.

## People and phone discovery

The empty search previously returned the newest registered accounts. It now
shows only explicitly saved, one-way contacts. Searches require two characters;
names and usernames use literal, case-insensitive matching. Wildcards are escaped
and blocked accounts are excluded. Add/remove actions affect only the owner.

Phone lookup requires an exact international number, verified by the existing
Firebase phone sign-in, and the owner's explicit Profile opt-in (off by default).
Numbers are never returned in public results. Existing Google/email accounts
have no verified phone number and cannot be found by an unprovided number.
Existing starter-mode SMS restrictions are retained: this change does not enable
paid SMS or treat an unverified number as a verified identity. Previous phone
accounts populate their number on a subsequent supported verified phone login.

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

Physical Android/iPhone, distinct carrier networks and closed-app ringing are
not verified by browser emulation. No production load test is performed.
