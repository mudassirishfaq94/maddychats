# Bluehost VPS migration runbook

## Target and current state

The Circlo Node.js web app, scheduled-message worker, and private upload scanner
are running on the Bluehost Standard NVMe 4 VPS in Mumbai. The production Neon
PostgreSQL database remains in Ohio. Supabase private media was copied to
Cloudflare R2, and the source bucket remains available for rollback. A separate
Neon PostgreSQL 18 candidate now exists in AWS Singapore; production has not
been switched to it. Keep the existing Render service and source database until
the candidate passes migration and release checks.

## Database move candidate

The source is PostgreSQL 18.6 in AWS Ohio. Read-only inspection found
`public.e2ee_key_history` alone uses 502,734,848 bytes, so the Circlo database
already exceeds the 500 MB storage allowance on the connected Supabase Free
organization. Do not trim or discard this table: it holds encryption recovery
history. Supabase in Mumbai also runs PostgreSQL 17, so it is not the safe
zero-cost destination for this database.

The prepared candidate is the Neon project `lively-paper-26698921`, PostgreSQL
18.6 in AWS Singapore, branch `br-icy-smoke-aoa2mx1r`. It is separate and has
not received production data. Singapore is the closest region available to the
connected Neon organization; Mumbai was unavailable. The cutover should use
PostgreSQL 18 client tools, copy the complete database without owners/ACLs,
validate schema, constraints and table row counts, then pause writes for one
final consistent copy before changing the VPS database URLs. Keep Ohio unchanged
as a rollback source. Do not switch the app while users are writing to a stale
copy. Compare database RTT from the Bluehost host and measure chat flows again;
regional proximity is an estimate until measured, not a promised speedup.

The repository already contains the production Docker Compose stack. The VPS
uses `docker-compose.yml`, `.env`, and [`Caddyfile`](../Caddyfile); Caddy
terminates HTTPS for `circlo.chat` and proxies to the app on loopback port 3000.
The firewall should allow SSH only from an approved source and public TCP 80/443;
do not expose ports 3000 or 3310, PostgreSQL, or container control sockets.

The Bluehost dashboard currently shows the VPS provisioning. Bluehost lists its
Standard NVMe 4 plan as 2 vCPU, 4 GB RAM, and 100 GB NVMe ([official VPS resource
table](https://www.bluehost.com/help/article/bh-self-managed-server-resources)).
The Compose stack includes ClamAV, so memory pressure and scanner readiness must
be measured before switching live traffic.

## Baseline

On 2026-10-23, three GETs to `https://circlo.chat` from the development
workstation returned:

| Endpoint | Observed range | Median | Sample count |
| --- | ---: | ---: | ---: |
| `/api/health` | 554–1,717 ms | 1,388 ms | 3 |
| `/` | 409–562 ms | 441 ms | 3 |

These wall-clock samples include DNS, TLS, internet routing, and client time.
They are a rough origin baseline, not isolated server timings; no physical phone
or target VPS measurement is available yet. Do not claim a percentage speedup
until the same tests run against both hosts under comparable network and cache
conditions.

## Staged rollout

1. Wait for Bluehost to finish provisioning. Add the generated SSH **public**
   key to the VPS account; keep its private key on the development workstation.
   Verify the server fingerprint on the first SSH connection. Apply Ubuntu
   security updates, configure key-based SSH, and allow only required firewall
   ports.
2. Install Docker Engine and the Compose plugin. Install Caddy using the
   [official Ubuntu package instructions](https://caddyserver.com/docs/install),
   then copy the repository `Caddyfile` to `/etc/caddy/Caddyfile`. Clone the reviewed `main`
   commit, copy `.env.example` to `.env`, and set file permissions to `0600`.
   Transfer production secrets directly to the host; never place them in Git or
   chat. Set `DATABASE_URL` to the existing pooled Neon URL and
   `REALTIME_DATABASE_URL` to the existing direct/session Neon URL. Keep the
   current Supabase URL, service key, and private bucket. Preserve the current
   JWT and provider secrets so existing sessions and sign-in continue working.
3. Set `CLIENT_URL=https://circlo.chat`, the matching Google callback, and the
   existing Firebase/VAPID values. Set a random `HEALTHCHECK_SECRET` and
   `CRON_SECRET`. The application and migration containers use the bundled
   Supabase root CA at `/app/scripts/certs/supabase-ca.crt`; do not carry over a
   Render-only absolute path for `NODE_EXTRA_CA_CERTS`. Confirm the VPS can reach
   Neon and Supabase without opening inbound database or storage ports.
4. Build and start the Docker Compose stack while keeping public DNS on Render.
   Confirm the database migration container exits successfully, all containers
   become healthy, `/api/ready` reports readiness from inside the host, and
   `docker compose logs` contains no out-of-memory, scanner, migration, or
   realtime-listener failures. Observe memory and CPU during build, startup, and
   upload scanning; require sustained memory headroom before cutover.
5. Smoke-test account sign-in, an existing chat, a new encrypted message,
   reconnect/realtime delivery, image and video attachments, notification
   registration, and the scheduled-message worker. Use test accounts and never
   log or inspect plaintext or key material. Verify SSE remains connected.
6. Before DNS cutover, lower the `circlo.chat` record TTL if the DNS provider
   allows it. Confirm the VPS address from the Bluehost dashboard. Update the
   domain's A record to that address; add an AAAA record only if IPv6 is
   configured end to end. Do not point the domain at the earlier placeholder
   address shown while provisioning.
7. Verify Caddy obtains a trusted certificate, then repeat checks over
   `https://circlo.chat` from desktop and the Poco X7 Pro. Compare at least 30
   warmed and cold-path samples for startup, first chat open, message delivery,
   media load, and tab navigation; report p50 and p95, plus VPS CPU/RAM. A
   90% improvement is a target to measure, not a promised result.
8. Keep Render available for rollback while monitoring the new host. If login,
   realtime, notifications, media, database readiness, or resource health fails,
   point the A record back to Render and investigate before trying again. Once
   the VPS is stable and rollback is no longer needed, disable Render auto
   deploy and retire the Render service. Do not remove it during the initial
   cutover window.

## Rollback boundaries

This plan keeps the same Neon database, Supabase bucket, origin, encryption
protocol, and authentication secrets, so the application can return to Render
by restoring DNS. Do not run a database restore or change the production schema
as part of the hosting move. Keep one active web instance in steady state
because presence is process-local. After DNS changes, allow only the short DNS
TTL transition before stopping the Render web process; expect presence to be
incomplete during that brief overlap. Disable the Render scheduled processor
when the VPS worker starts, and keep one active scheduled worker in steady state.

## Required access still pending

- Bluehost provisioning must finish and SSH key access must be enabled.
- Confirm which DNS provider currently controls `circlo.chat` and that it can
  change the A/AAAA records. The observed public A record currently resolves to
  Render.
- The physical Poco X7 Pro must be available for final Android WebView and push
  checks; browser-only tests do not verify Android system notification display.
