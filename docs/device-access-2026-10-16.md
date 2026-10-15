# Simple device access after sign-in

After password, Google or phone sign-in (and MFA when enabled), web users visit
`/app/device-access`. The server requires an eligible authenticated session.
The browser registers its existing/new encryption identity through the original
provider. A returning trusted browser proves its private key before continuing
to the requested private screen. A new account's first device also proves its
key; an empty trusted set on an existing account cannot bootstrap another one.
A pending browser offers two choices and shows only the selected form:

- Link this device: a trusted browser generates a six-digit, device-bound, single-use code
  lasting 10 minutes. Linking retains the existing sessions.
- Recover access: use the account's verified email code and recent sign-in.
  An explicit checkbox confirms signing out all other sessions and revoking
  their encryption approvals. The same account and historical key records remain.

Recovery cannot reconstruct missing encryption keys. Reading old messages still
requires an original trusted device or a recovery backup containing those keys.
New sessions persist `approval_required=true`. Normal pages, APIs and long-lived
connections use the central session resolver and reject them. The setup-only
resolver is limited to owner key registration, device linking, email recovery,
identity/expiry checks and logout. Restricted sessions expire after 15 minutes;
refresh rotation preserves the restriction. There is no "set up later" bypass.
The setup screen does not mount calls, realtime or notification providers.

Migration 0048 also restricts existing active sessions without a trusted key
binding. It preserves trusted sessions and all historical key records. Approval
clears the flag transactionally only after private-key proof. Recovering access
refreshes the proven session's authentication time beyond its legacy-cookie
revocation watermark, so subsequent refresh rotation remains valid.
Sessionless legacy cookies require sign-in again because they have no persisted
device approval state. This does not remove saved browser keys or their trust.

Six-digit codes have a 10-minute TTL, a keyed HMAC hash and five verification
attempts per account per 10 minutes. Restricted sessions cannot fetch legacy
backups protected only with public device IDs or overwrite a key backup before
proving possession. Settings retain their original recovery controls, which
remain available to fully verified sessions.

No account deletion action is present in this flow. Deletion remains a separate
confirmation in account settings. Existing Settings linking, backups, recovery,
and technical details remain available; no authentication or crypto checks are
weakened. No new services, dependencies or costs are introduced. The migration
and its rollback SQL are reviewable under drizzle/.

Local browser regression uses real sign-in, device-key registration, linking,
approval APIs and persisted status. Its email code is seeded only for an owned
fake account in the loopback test database; it does not claim real inbox delivery.
It tests explicit recovery consent, revocation of older sessions, retained
account/key records, and portrait/landscape/reduced-height touch layouts. Existing
security tests cover incorrect/replayed codes, MFA and cross-account rejection.

Feature-only integration tests explicitly seed an approved session in their
isolated loopback database via fixture-app-session.mjs. This helper refuses a
remote/non-test database and is never called by the real device-gate tests.
The gate regression uses actual sign-in, private-key proof and linking/recovery,
and checks direct private API/page denial and refresh rotation before approval.
