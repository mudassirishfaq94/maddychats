# Item 1: account and transcript security

## Behavior

- Email/password registration requires configured Resend delivery (`RESEND_API_KEY`
  and `EMAIL_FROM` or `EMAIL_FROM_ADDRESS`). Registration sends a verification
  link and issues no session. Email/password login requires `email_verified_at`.
- Migration `0033_account_security.sql` backfills only previously consumed
  verification links. Other existing password accounts must verify on their
  next login; already issued non-MFA sessions retain their existing lifetime.
  Verified Google email is recorded when it matches the account email. Phone
  sign-in relies on Firebase phone verification, not a fabricated email address.
- Every sign-in method hands MFA users a five-minute opaque HttpOnly challenge.
  Only successful TOTP or recovery-code consumption creates an app session.
  Challenges and recovery codes are single-use; TOTP steps cannot be reused.
  Enrollment invalidates sessions without proof of the current MFA enrollment.
- Recovery codes appear only after enrollment/replacement. Ten random codes are
  generated, only SHA-256 hashes are stored, and replacing codes invalidates the
  previous set. Existing MFA users can log in with TOTP and generate codes.
- MFA setup, enrollment, disabling, recovery-code replacement, and account
  deletion require a full sign-in within five minutes or password confirmation
  (plus an unused TOTP/recovery code when MFA is enabled). Google/phone users
  sign in again. Cookie renewal preserves authentication time.
- Transcript reads require membership and a visible, non-expired audio message.
  Only its sender can edit the legacy plaintext transcript. Encrypted message
  or attachment transcripts are rejected by the server and hidden in the audio
  UI; no encrypted audio is sent to a speech provider. Migration removes legacy
  plaintext transcripts on encrypted attachments. Client-local transcription
  generation is not introduced by this change.

## Database change

Apply the registered `0033_account_security` migration before deploying this code.
It adds `users.email_verified_at`, MFA replay/recovery columns, and a private
`mfa_challenges` table. This work does not repair earlier migration ordering.
Do not apply migrations to an application database merely to run the tests.

## Verification

The integration script refuses databases except a local database named
`item1_security_test`. It resets test users and security metadata. Use a separate
PostgreSQL instance/database, never an application database.

1. Create the isolated `item1_security_test` database.
2. Set `DATABASE_URL` to it and run `npm run db:migrate` to initialize the
   current schema using the registered migrations, including device sessions.
3. Build the app with `npm run build`.
4. Set `ITEM1_TEST_DATABASE_URL` to the isolated database URL, then run
   `npm run test:item1`. It starts a loopback-only test server on port 3107 and
   stops it on completion, with test-only secrets and email delivery disabled.


The script exercises migration application, RFC TOTP vectors, replay/concurrent
recovery rejection, expiration/revocation/suspension, registration, email
verification consumption, MFA login/enrollment, transcript access boundaries,
and fresh-authentication requirements. Google/Firebase credentials and email
sending are not contacted by these tests; real provider/browser/device QA needs
test credentials and a device.
