# Circlo: safe Render and Supabase cutover

Earlier runbook. Render + Supabase is the selected production target again;
use [the verified cutover plan](./docs/RENDER_DEPLOYMENT_CUTOVER.md) and
[DEPLOYMENT.md](./DEPLOYMENT.md) for current deployment and restoration steps.
Production remains on Neon until a consistent, verified cutover is complete.

This runbook deliberately does **not** perform database changes. Neon remains
the source of truth until the verification steps below pass. Do not add a
Render pre-deploy command that runs Drizzle migrations for this cutover.

## Render web service

Use the native Node runtime (not the Docker runtime), Node 22, build command
`npm ci && npm run build`, start command `npm start`, and health-check path
`/api/health`. Render supplies `PORT`; `next start` listens on it. The public
health check intentionally returns `204` without database details, which is a
successful Render HTTP health-check response.

The current temporary Render origin is `https://maddychats.onrender.com`.
Set `CLIENT_URL` to that origin before cutover (replace both values when a
custom domain is ready). Set `GOOGLE_CALLBACK_URL` to
`${CLIENT_URL}/api/auth/google/callback` and register
that exact URL with Google. Set the same final origin in the Firebase
authorized-domains configuration if browser phone authentication is enabled.

Keep one Render instance for this release. Presence is process-local; the
event queue is database-backed, but separate instances can still disagree
about live presence and per-user stream limits.

Scheduled messages require an external scheduler. Create a Render Cron Job or
another authenticated scheduler that calls:

```text
GET https://<final-domain>/api/cron/process-scheduled
Authorization: Bearer <CRON_SECRET>
```

Use a schedule such as `* * * * *` only after assessing load; the route is
safe to invoke repeatedly but requires `CRON_SECRET` in production.

## Environment-variable checklist

Required for production:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase PostgreSQL connection string; the only application DB URL. Use the Supabase pooler if Render needs IPv4; retain TLS in the supplied URL. |
| `JWT_SECRET` | At least 32 characters; existing production value if sessions must survive cutover. |
| `CLIENT_URL` | Canonical public `https://` Circlo origin. |

Feature-specific:

| Variable(s) | Feature |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Google OAuth |
| `RESEND_API_KEY`, `EMAIL_FROM` | Password reset email |
| `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO` | Email verification sender customization |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | Private Supabase Storage; without the first two, media uses non-persistent local disk |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Android FCM delivery |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Browser phone OTP |
| `CRON_SECRET` | Authenticated scheduled-message processor |
| `HEALTHCHECK_SECRET` | Optional authenticated DB-readiness probe; do not use it for Render's public health check |
| `DATABASE_POOL_MAX` | Optional, defaults to 5 |
| `SESSION_TTL_DAYS` | Optional, defaults to 365 |
| `MAX_AVATAR_MB`, `MAX_IMAGE_MB`, `MAX_FILE_MB` | Optional upload limits, each defaults to 3 |
| `APP_VERSION` | Optional build-time version exposed by the app-version endpoint |

Development/test-only: `DEV_SEED_PASSWORD`, `TEST_BASE`, `QA_BASE`,
`QA_LABEL`, and `PLAYWRIGHT_MODULE`. `PORT` and `NODE_ENV` are platform
provided. `NEXT_PUBLIC_APP_URL` is deprecated/unused after this change.

Never set `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, or database URLs with a
`NEXT_PUBLIC_` prefix.

## Database migration: operator-run only

Run these from a trusted Windows machine with PostgreSQL client tools installed
(the `pg_dump`, `pg_restore`, and `psql` executables). Use a `pg_dump` version
equal to or newer than the Neon server version. Do not paste real URLs into
shell history or this repository; set temporary session variables instead.

1. Stop or place the old writer in maintenance mode for the final cutover so
   no writes are missed. First take a custom-format Neon backup:

```powershell
$env:NEON_DATABASE_URL = '<Neon connection string>'
$env:SUPABASE_DATABASE_URL = '<Supabase direct connection string>'
pg_dump --format=custom --no-owner --no-privileges --file circlo-neon.backup $env:NEON_DATABASE_URL
pg_restore --list circlo-neon.backup
```

2. Restore to the empty Supabase project. Use the direct connection string for
   restore and schema work, not the transaction pooler:

```powershell
pg_restore --verbose --clean --if-exists --no-owner --no-privileges --dbname=$env:SUPABASE_DATABASE_URL circlo-neon.backup
```

`--clean --if-exists` only targets the Supabase destination and is destructive
there; use it **only** after confirming the project is the intended empty
`circlo` project. If it is not empty, stop and choose a separately approved
restore plan.

3. Verify structure and data before changing Render:

```powershell
psql $env:SUPABASE_DATABASE_URL -c "\dt public.*"
psql $env:SUPABASE_DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
psql $env:SUPABASE_DATABASE_URL -c "SELECT extname, extversion FROM pg_extension ORDER BY extname"
psql $env:SUPABASE_DATABASE_URL -c "SELECT conrelid::regclass AS table_name, conname FROM pg_constraint WHERE contype = 'f' ORDER BY 1,2"
psql $env:SUPABASE_DATABASE_URL -c "SELECT schemaname, tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1,2,3"
psql $env:SUPABASE_DATABASE_URL -c "SELECT sequencename, last_value FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename"
```

Compare row counts for every user table using the same query against both
connections (replace `users` one table at a time):

```powershell
psql $env:NEON_DATABASE_URL -c "SELECT count(*) AS users FROM public.users"
psql $env:SUPABASE_DATABASE_URL -c "SELECT count(*) AS users FROM public.users"
```

4. Do **not** run `npm run db:migrate` immediately after a full restore. First
inspect `public.__drizzle_migrations` and compare it with
`drizzle/meta/_journal.json`. The repository also has an untracked,
non-journaled `drizzle/0032_e2ee_trusted_devices.sql`; establish whether its
schema is already present in Neon/Supabase before creating a reviewed Drizzle
migration. Run Drizzle only for migrations proven absent from the restored
database and only with the Supabase URL explicitly set.

5. Perform authenticated smoke tests against the Supabase-backed staging or
new Render deployment. Only then replace Render's `DATABASE_URL` with the
verified Supabase connection string, deploy, and keep Neon and Vercel intact
as rollback options until the release is stable.

The schema uses PostgreSQL UUID defaults (`gen_random_uuid()`), enums,
JSONB, timestamps with time zone, partial/expression indexes, foreign keys,
and RLS. It explicitly requests the `pg_trgm` extension for search. Supabase
Postgres supports these PostgreSQL features; enable/verify `pg_trgm` in the
target project before applying the search migration. The application accesses
the database through `pg`, so Supabase Auth and the public Data API are not
part of the runtime path.

## Storage and SSE notes

The app does not use Vercel Blob. It uses Supabase Storage when both
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured; otherwise it
falls back to `server/uploads`. That fallback may allow a short smoke test but
is unsafe for Render production because local files are not durable across
deploys/restarts and do not scale across instances. Existing local media also
needs a separate, authorized migration plan; it is not moved by the database
dump.

SSE is `/api/realtime/stream`: authenticated, Node-runtime, 25-second
heartbeats, 500-ms PostgreSQL event polling, five streams per user, and a
280-second intentional reconnect cycle. Ensure Cloudflare does not buffer the
endpoint and permits long-lived responses; test it through the final domain.
