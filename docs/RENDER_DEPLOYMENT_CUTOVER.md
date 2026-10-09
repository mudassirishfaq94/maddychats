# Render and Supabase cutover

The current target is the existing Render `circlo` service at
https://maddychats.onrender.com. Its production database is still Neon.
The Supabase project `realtime chat application` (`ewkzodtvduwbjbomxvpu`)
has been verified active and linked locally. Its existing profile tables and
`chat media` bucket belong to earlier work and must be preserved.

## Prepared resources

- Dedicated `maddy_app` database login with no superuser or RLS-bypass privileges.
- Private `maddy-media` bucket, separate from the existing bucket.
- Local candidate connection uses the discovered session pooler on port 5432.
  Full TLS verification and PostgreSQL LISTEN were tested successfully.
- `scripts/certs/supabase-ca.crt` is Supabase's public CA certificate, downloaded
  over verified HTTPS. Set `NODE_EXTRA_CA_CERTS` before starting Node, including
  migration commands. Do not disable certificate verification.
- `render.yaml` describes the existing web service, a private ClamAV scanner,
  and a scheduled worker. The scanner image is pinned by registry digest.

## Paid infrastructure approval

The proposed Render instances are Standard web (2 GB, $25/month), Standard
private scanner (2 GB, $25/month), and Starter worker ($7/month): approximately
$57/month in compute, before additional usage, tax, and Supabase billing.
Check current prices at https://render.com/pricing before provisioning.
Render validation currently rejects these plans with `need_payment_info`.
No paid services have been created or upgraded.

The current Render service is in Oregon, while this Supabase project is in
Mumbai. This preserves the existing URL but incurs cross-region database
latency. Measure it before claiming a performance target; colocating the
providers would require a separately planned region/endpoint migration.

## Safe deployment sequence

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

Production has not been migrated or redeployed yet.
