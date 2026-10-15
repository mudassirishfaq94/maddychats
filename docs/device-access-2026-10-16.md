# Simple device access after sign-in

After password, Google or phone sign-in (and MFA when enabled), web users visit
`/app/device-access`. The server requires an eligible authenticated session.
The browser registers its existing/new encryption identity through the original
provider. An already trusted browser continues to the requested private screen.
A pending browser offers two choices and shows only the selected form:

- Link this device: a trusted browser generates a device-bound, single-use code
  lasting 10 minutes. Linking retains the existing sessions.
- Recover access: use the account's verified email code and recent sign-in.
  An explicit checkbox confirms signing out all other sessions and revoking
  their encryption approvals. The same account and historical key records remain.

Recovery cannot reconstruct missing encryption keys. Reading old messages still
requires an original trusted device or a recovery backup containing those keys.
Users may postpone setup, but existing server restrictions still prevent an
untrusted device from sending/receiving protected key material.

No account deletion action is present in this flow. Deletion remains a separate
confirmation in account settings. Existing Settings linking, backups, recovery,
and technical details remain available; no authentication or crypto checks are
weakened. No new services, dependencies, schema changes or costs are introduced.

Local browser regression uses real sign-in, device-key registration, linking,
approval APIs and persisted status. Its email code is seeded only for an owned
fake account in the loopback test database; it does not claim real inbox delivery.
It tests explicit recovery consent, revocation of older sessions, retained
account/key records, and portrait/landscape/reduced-height touch layouts. Existing
security tests cover incorrect/replayed codes, MFA and cross-account rejection.
