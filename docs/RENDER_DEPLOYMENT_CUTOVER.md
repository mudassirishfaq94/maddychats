# Render starter deployment and future Supabase cutover

The current target is the existing Render `circlo` service at
https://maddychats.onrender.com. Its production database is still Neon.
The Supabase project `realtime chat application` (`ewkzodtvduwbjbomxvpu`)
has been verified active and linked locally. Its existing profile tables and
`chat media` bucket belong to earlier work and must be preserved.

## Current approved $0 launch

The user approved a limited starter deployment without paid services. The active
Blueprint now declares only the existing free web service, with STARTER_MODE=1.
Keep Neon for production data. Pause new uploads/voice, phone sign-in, and
scheduled delivery. Retain encryption, recovery, drafts, and existing history.
Google verifies ownership for existing password users through a short-lived
proof that still requires their password and MFA, without automatic linking.

## Starter release procedure

1. Back up Neon and verify a complete isolated restore before schema changes.
2. Apply the tested Drizzle migrations to the existing Neon database using
   verified TLS; preserve all existing identities, ciphertext and key history.
3. Update the existing Render service by ID. Keep its free instance plan,
   Neon/JWT/Google credentials, and set STARTER_MODE=1 at build and runtime.
   Use direct Neon for LISTEN, private Supabase Storage, distinct readiness/cron
   secrets and enforced nonce CSP. Do not create a scanner or scheduled worker.
4. Require full CI, pin the exact review-branch commit and disable automatic
   deployment. The reference Blueprint uses `main`; the currently deployed
   review branch is `codex/audit-remainder-20261009` until it is merged.
5. Verify version and private readiness, then test only owned disposable live
   accounts for encrypted sending, preserved drafts, real typing and trusted
   device recovery. Remove those fixtures afterward. Measure cold-browser
   mobile page loads separately from warmed typing and Render cold starts.

## Prepared resources

- Dedicated `maddy_app` database login with no superuser or RLS-bypass privileges.
- Private `maddy-media` bucket, separate from the existing bucket.
- Local candidate connection uses the discovered session pooler on port 5432.
  Full TLS verification and PostgreSQL LISTEN were tested successfully.
- `scripts/certs/supabase-ca.crt` is Supabase's public CA certificate, downloaded
  over verified HTTPS. Set `NODE_EXTRA_CA_CERTS` before starting Node, including
  migration commands. Do not disable certificate verification.
- `render.yaml` describes only the existing free web service. A scanner and
  scheduled worker are not provisioned in starter mode.

## Paid infrastructure approval

The earlier paid alternative (not authorized) would use Standard web (2 GB, $25/month), Standard
private scanner (2 GB, $25/month), and Starter worker ($7/month): approximately
$57/month in compute, before additional usage, tax, and Supabase billing.
Check current prices at https://render.com/pricing before provisioning.
Render validation currently rejects these plans with `need_payment_info`.
No paid services have been created or upgraded.

The user declined paid services. This configuration is retained as a reviewed
reference and must not be provisioned without a later change to that instruction.

The current Render service is in Oregon, while this Supabase project is in
Mumbai. This preserves the existing URL but incurs cross-region database
latency. Measure it before claiming a performance target; colocating the
providers would require a separately planned region/endpoint migration.

## Future Supabase database cutover (deferred)

1. Complete a Neon backup and restore rehearsal in isolation. Verify schema,
   migration history, row counts, constraints, and encrypted message data.
   An archive listing alone is insufficient to establish recoverability.
2. Restore only this app's tables into Supabase as `maddy_app`, with no owner
   or ACL restoration. Do not overwrite the existing profile tables.
3. Apply the app's Drizzle migrations through 0038. Enable RLS and revoke
   PUBLIC/anon/authenticated privileges on every restored app table, sequence,
   and internal function before permitting app traffic. This app uses its own
   authentication, so do not invent Supabase auth.uid policies.
4. Verify the dedicated login can operate the app, while anonymous Data API
   access cannot read app records. Run Supabase security advisors and distinguish
   any pre-existing project's issues from newly introduced issues.
5. After paid infrastructure approval and a payment method are available, update
   the existing web service by service ID. Do not accidentally create another
   `circlo` web service through Blueprint import. Provision the scanner and
   worker in the same Render region.
6. Keep existing production JWT and OAuth credentials. Configure the Supabase
   server-only key, private bucket, verified-TLS database connection, scanner
   hostname, and distinct readiness/cron secrets. Supply required public provider
   configuration during the Next build; bake the actual release SHA into APP_VERSION.
7. Arrange a brief maintenance window, take a final consistent backup, restore
   and verify it, and then cut over. Never copy an earlier snapshot while the
   old production service continues writing without a reconciliation strategy.
8. Deploy the tested release, verify authenticated readiness and version, then
   test sign-in, encrypted messaging, new-device approval and restore, draft
   preservation, scanned uploads, authorized media reads, and scheduled messages.
9. Run production speed measurements and retain rollback information. Database
   rollback must account for writes after cutover; a code rollback alone is not
   a safe database rollback.

## Verified rehearsal

A 179,004,111-byte custom-format backup of the live Neon application schemas
was restored successfully into an isolated local database. Its extension
manifest includes `pg_trgm`, and the archive has a recorded SHA256 checksum.
All 39 release migrations then completed, including the five required by
readiness. The restored database is approximately 424 MB; the free Supabase
database allowance therefore has limited remaining capacity for growth.

The source journal stopped at `0013_auth_identity_uniqueness`, although later
feature objects already existed. The privacy migration now preserves existing
tables/indexes and checks enum definitions before accepting an existing type.
The Signal prekey migration checks the columns of an existing uniqueness
constraint before accepting it. Regression tests cover manually applied legacy
DDL, reject incompatible definitions, and verify fresh upgrades and restoration.

The starter release `6fee6236` was deployed to the existing free Render service
on October 9, 2026. All 39 migrations preserved 42 users, 77 conversations,
582 messages, 22 attachment records and 548,650 historical keys. Live encrypted
sending, failed/newer draft preservation, trusted-device approval and restoration
passed. No scanner or independent worker is provisioned; their features are
paused in starter mode. The follow-up uint32 fix is validated against fresh,
upgraded and restored isolated databases through migration 0039 (40 entries).
The deployed exact SHA and latest live speed evidence are recorded in PR #6.

## Legacy media preservation check (October 9, 2026)

Before changing the live service, all 25 referenced media paths were checked through the existing authenticated media endpoint. All 25 returned 404 on the original Render deployment. One exact local file was recovered, backed up and copied to the private `maddy-media` bucket; its SHA-256 was verified after download. The other 24 binaries were already unavailable and are not present in the local upload directory or the existing Supabase bucket. Their message/attachment metadata and encryption key history are preserved. A database backup cannot reconstruct those missing binaries; recovering them requires an original file/storage backup. No remaining source files were deleted.

Key history contained 548,650 rows before deployment. Recovery now returns at most 200 keys per page, compacts repeated wraps for known recipient/fingerprint pairs, and retains paginated raw fallback plus all unknown legacy copies. No historical key rows are deleted. Starter housekeeping removes only expired realtime replay events and inactive rate-limit windows while the app is awake; scheduled messages remain paused.

The live runtime check identified Signal's unsigned 32-bit prekey IDs exceeding PostgreSQL's signed integer range. Migration 0039 widens only `key_id` to bigint, and the adapter retains numeric JSON IDs. Input validation rejects negative/out-of-range IDs. Starter mode pauses the unused experimental Signal directory and its background WASM download/prekey generation; the existing AES-GCM/RSA-OAEP chat encryption and device recovery continue unchanged.

Supabase's connected security advisor reports only pre-existing profile-table GraphQL discovery and Supabase Auth configuration notices. This app does not use those tables or Supabase Auth; its database remains Neon and storage access is authorized server-side through a private bucket. The unrelated existing tables/policies were preserved.
