# Production deployment: Supabase + Docker VPS

This application no longer depends on Vercel, Neon, or Vercel Blob. It is
designed to run continuously in a Docker container on a paid VPS, with
Supabase providing PostgreSQL and private media storage. A paid service is
intentional: no free tier can guarantee that a production service will never
pause or reject traffic after a usage limit.

## 1. Provision Supabase

1. Create a Supabase project on a paid plan in a region close to the VPS.
2. In **Connect**, copy the **direct** Postgres URL for a VPS with IPv6. For
   an IPv4-only VPS, copy the **Session Pooler** URL instead. Set it as
   `DATABASE_URL` in the server's `.env`.
3. In **Storage**, create a bucket named `maddy-media` and leave it **private**.
   The application authorizes every media read through `/api/media`; do not
   make this bucket public.
4. In **Settings → API**, copy the Project URL into `SUPABASE_URL` and the
   `service_role` secret into `SUPABASE_SERVICE_ROLE_KEY`. These values stay
   on the server only—never prefix them with `NEXT_PUBLIC_`.
5. Apply the schema from a trusted machine using the direct database URL:

   ```powershell
   $env:DATABASE_URL='postgresql://...'
   npm ci
   npm run db:migrate
   ```

   For an existing Neon database, export it with `pg_dump` and restore it to
   Supabase with `pg_restore` before switching the live app. Take a backup and
   schedule a brief maintenance window so writes cannot be lost during the
   final cutover.

## 2. Prepare the VPS

Use an Ubuntu VPS with Docker Engine and Docker Compose installed. Point your
domain's DNS A/AAAA record at the VPS, then place a reverse proxy with TLS
(for example, Caddy or Nginx) in front of `127.0.0.1:3000`.

On the server:

```bash
git clone https://github.com/mudassirishfaq94/maddychats.git
cd maddychats
cp .env.example .env
chmod 600 .env
```

Fill `.env` with the Supabase values above plus the existing authentication,
email, Firebase, VAPID, and `JWT_SECRET` values. Set `CLIENT_URL` to the final
HTTPS origin and `GOOGLE_CALLBACK_URL` to `${CLIENT_URL}/api/auth/google/callback` (or unset it
to derive it). Register this exact callback in Google and the domain in
Firebase Auth. Generate `JWT_SECRET`
with `openssl rand -hex 32` if you do not already have the live value.

Set distinct random `HEALTHCHECK_SECRET` and `CRON_SECRET` values, using
`openssl rand -hex 32`. Keep `PORT=3000` for this Compose configuration. Set
the public Firebase variables, VAPID public key, and `APP_VERSION` before
building: browser-visible values are baked into the image. `.dockerignore`
excludes environment files, databases, uploads, backups, Android artifacts,
and local caches; runtime secrets enter only through `.env` at container start.

Build and start the app:

```bash
docker compose up -d --build
docker compose logs -f web
```

Compose runs the migration container before starting web, then starts the
worker only after web becomes ready. Migration failure blocks startup.
Web also waits for the private ClamAV service, which may take several minutes
to download signatures on its first start. Keep port 3310 private. Readable
uploads fail closed if scanning is unavailable. This release applies migrations
`0035_upload_retention` and `0036_device_sessions`; readiness checks both.
Start with `CSP_ENFORCE=0`, validate the provider/native/PWA flows in staging,
then enable enforcement. See [tasks 4–6](./docs/ITEMS4_6_HARDENING_AND_PERFORMANCE.md)
for retention, session migration, scanner checks, and performance profiling.
Verify `https://your-domain/api/health`, then test sign-in, media upload,
messaging, and push notifications. Set up the host's firewall to expose only
ports 80 and 443; do not expose port 3000 or database credentials.

## Operations

- Back up the database and private media before updates. Put the reverse proxy
  in maintenance mode and follow the update sequence below.
- Use a paid Supabase project and enable backups/billing alerts. Free projects
  have hard limits and can pause, so they are unsuitable for this requirement.
- Monitor VPS disk, RAM, and CPU, and configure automated off-host backups.
- Presence remains process-local: keep one web replica. Realtime events and
  rate-limit buckets are persisted in PostgreSQL.
- Realtime uses one dedicated PostgreSQL LISTEN connection per web process.
  Set `REALTIME_DATABASE_URL` to the same database's direct/session connection
  if `DATABASE_URL` uses transaction pooling. Apply migration `0037` before
  startup; readiness verifies the listener. See
  [remaining audit work](./docs/REMAINING_PROJECT_WORK.md).
- Monitor Docker health status for web and scheduled-worker and alert when
  either becomes unhealthy. Restart policies restart crashes, not unhealthy
  containers. Monitor both services rather than public liveness alone.

## Safe updates and monitoring

Schema changes may affect the previous application version. Stop writes and
the worker for the migration, then restore traffic after readiness and smoke
checks pass:

```bash
docker compose stop scheduled-worker web
docker compose build
docker compose run --rm migrate
docker compose up -d
docker compose ps
docker compose logs --tail=100 scheduled-worker
```

Public `/api/health` is liveness only. Private `/api/ready` requires
`Authorization: Bearer <HEALTHCHECK_SECRET>` and returns 200 only when the DB
and release schema are ready; failures return 503 without database details.
Compose runs `scripts/readiness.mjs` automatically.

The independent worker calls the authenticated cron endpoint every 15 seconds,
retries failures, and records a heartbeat only after a successful batch.
Its health check detects stale successes. No browser needs to remain open.
Use a direct or session-pooler DB connection: processing uses a session-scoped
advisory lock to prevent overlapping batches. Due messages beyond the batch
limit of 50 are handled on subsequent intervals.

## Migration compatibility

The journal registers `0032_e2ee_trusted_devices` after the already introduced
`0033_account_security`. This ordering is intentional: Drizzle skips migration
timestamps older than the latest recorded entry. `0034_deployment_schema_repair`
reconciles unregistered 0017–0022 changes and the missing channel conversation
reference on fresh databases and existing journal-managed ones. Existing data
is retained. Manually upgraded pending devices stay pending; only devices
predating the trusted-device column are backfilled. Do not reorder the journal
or edit released SQL.

For a database previously initialized solely with `drizzle-kit push`, do not
run the journal blindly: its initial migration creates existing tables. Clone
it to staging, compare schema/history, and establish a reviewed baseline before
cutover. The tested upgrade path uses the existing migration journal.

## Android origin

Use the same HTTPS `CLIENT_URL` without a trailing slash for Capacitor and
Gradle. The native API URL and app-link host derive from it:

```powershell
$env:CLIENT_URL='https://chat.example.com'
npx cap sync android
cd android
./gradlew :app:assembleDebug
```

Publish the Android `assetlinks.json` for the chosen domain and signing
certificate before expecting verified app links. Keep OAuth and Firebase
authorized domains aligned with this origin.

## Backup and restoration

Install PostgreSQL client tools matching or newer than the server. Set `PG_BIN`
if executables are not on PATH. From a trusted machine:

```bash
node --env-file=.env scripts/database-backup.mjs backup backups/application.dump
```

This creates a custom-format backup of the application `public` schema and
`drizzle` history, plus a companion `.dump.json` extension manifest. Keep both
files together. Schema-scoped dumps omit extension definitions; the manifest
records required extensions such as `pg_trgm` and their schema locations.
The command refuses to overwrite an existing backup. Use timestamped
filenames for recurring backups. Encrypt copies and send them off-host.
Credentials pass through the child environment, not command arguments. For
remote connections use verified TLS, such as `sslmode=verify-full` with the
provider CA configured through `PGSSLROOTCERT`.

A database dump does not back up Supabase Storage objects, provider settings,
Firebase, or client encryption keys. Export the private `maddy-media` bucket
separately with a trusted object export, retain encrypted off-host copies,
and verify object paths/counts. Database restoration alone cannot recover
missing media bytes or client encryption keys.

Run a restore drill in a newly created empty, isolated database, with its
connection string in `RESTORE_DATABASE_URL`:

```bash
node scripts/database-backup.mjs restore backups/application.dump
```

The command refuses a destination with existing application relations. It
first prepares extension dependencies using the manifest (the restore role
needs permission to install them). It refuses a conflicting extension schema
instead of moving an existing extension. It then restores application objects
in one transaction, stopping on errors, without source ownership or
ACLs. Reapply provider access restrictions, run migrations on the isolated
destination if restoring an older release, and verify private readiness,
account/message counts, sample attachment paths, sign-in, and test scheduling.
Restore private media separately before testing media reads.

Production cutover requires maintenance, stopped writes/worker, a final backup,
and switching credentials only after the restored environment passes checks.
Retain the previous environment and final backup until the cutover is verified.

## Local deployment verification

After `npm run build`, run the isolated drill:

```powershell
$env:ITEM2_TEST_DATABASE_URL='postgresql://test_operator@127.0.0.1:5432/item2_deployment_test'
npm run test:item2
```

The role needs permission to create disposable databases. The script resets
only `item2_deployment_test`, `item2_upgrade_test`, and `item2_restore_test` on
a loopback host. It verifies fresh/upgraded migrations, Drizzle table columns
and nullability, reruns, pending-device preservation, private readiness and
liveness during schema degradation, independent delivery, worker heartbeats,
and real backup restoration of messages and migration history. It leaves test
databases and a temporary dump available for inspection.
