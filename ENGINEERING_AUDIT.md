# ZipTalk Engineering Audit

Date: 2026-09-04  
Scope: 148 TypeScript/TSX/CSS files (~18,046 lines), 58 API route modules, database schema and migrations, authentication, uploads, realtime, PWA/deployment configuration, and principal chat UI paths.

## Executive summary

The application has a sound baseline for an early production chat product: authorization is performed server-side, chat history is paginated, SQL is parameterized through Drizzle, uploaded media is private and authorization-gated, passwords use bcrypt, cookies are HttpOnly/Secure, input schemas use Zod, and PostgreSQL's public API roles are denied by migration.

This audit fixed five security weaknesses and four measurable query/client performance problems. The optimized production build and TypeScript check pass. No committed secret, private key, database URL, or user-data dump was found in the tracked repository.

The largest remaining scalability issue is realtime delivery: every connected client polls PostgreSQL once per second through a long-lived SSE function. The largest remaining abuse-control issue is the process-local rate limiter, which is not globally effective across Vercel instances. The product is also **not end-to-end encrypted**: the application server and the configured administrator can read messages.

## Changes made in this audit

### Security

1. Added the missing same-origin guard to conversation deletion.
2. Added Fetch Metadata (`Sec-Fetch-Site`) rejection for known cross-site mutation requests, including requests where a browser omits `Origin`.
3. Changed session cookies from `SameSite=None` to `SameSite=Lax`. Cross-origin framing was already blocked, so `None` increased CSRF exposure without a working product benefit.
4. Production now fails closed when `JWT_SECRET` is absent or shorter than 32 characters; it no longer derives a production signing key from `DATABASE_URL`.
5. Bounded the in-memory rate-limit map under an active-key flood to prevent unbounded memory growth.
6. Added HSTS for HTTPS downgrade protection.

### Performance

1. Replaced the Status feed's per-status privacy/block checks (N+1 queries) with two bulk queries. Query count is now constant instead of growing by one or two queries per status.
2. Limited the conversation-list blocking query to rows involving the current user instead of loading the entire global blocks table.
3. Replaced repeated conversation-member array scans with a precomputed map, changing this step from approximately O(conversations × memberships) to O(conversations + memberships).
4. Combined voice-note duration and waveform analysis behind a capped shared cache. A clip is fetched and decoded once per page session rather than independently by two components.
5. Removed a redundant second database lookup when validating an attachment message's reply target.

## Findings by severity

### High — resolve before significant growth

- **Realtime database load:** each connected SSE client queries `realtime_events` every second. At 1,000 online clients this approaches 1,000 read queries/second even when nobody sends a message. Move fan-out to a managed realtime/pub-sub service (or LISTEN/NOTIFY behind a persistent gateway), retain the database only for durable catch-up, and add backoff when idle.
- **Distributed abuse protection:** authentication, messaging, uploads, and other limits use an in-process `Map`. Serverless instances do not share it and restarts erase it. Move counters to Redis/KV with atomic increment/expiry; key sensitive operations by both IP and account.
- **No end-to-end encryption:** messages are plaintext in PostgreSQL and the admin message API can search/read every message. This must be stated accurately in privacy claims. True E2EE requires client-side identity keys, per-conversation key management, device verification, encrypted attachments, and recovery design—not a small patch.
- **Admin identity is hardcoded:** one source-code email grants full administration. Store roles in the database, require re-authentication/MFA for destructive admin work, and record immutable admin audit events.

### Medium — next hardening cycle

- **365-day bearer session:** a stolen cookie stays useful for up to one year unless logout/password reset revokes it. Prefer a short-lived access token plus rotating refresh token/device sessions, with a UI to revoke devices.
- **Upload content validation trusts declared MIME:** extension/MIME allow-lists and `nosniff` are good, but the server does not inspect file signatures or transcode images. Add magic-byte detection, image decoding/re-encoding, and malware scanning before serving public-scale uploads.
- **JSON size limit relies on `Content-Length`:** chunked bodies can bypass the pre-parse check. Enforce an actual streamed-byte limit or a platform request-body limit.
- **Presence is approximate across instances:** the memory registry is instance-local and the 90-second database heuristic can show stale presence. Use a shared presence store with TTLs.
- **No Content Security Policy:** current headers cover framing, MIME sniffing, permissions, referrers, and HSTS, but CSP is absent. Introduce a nonce-based report-only CSP, observe violations, then enforce it.
- **No automated test suite:** there is no unit/integration/E2E test command. Priority cases are authorization boundaries, blocked users, CSRF, upload authorization, group roles, pagination cursors, message deletion, and session revocation.
- **Lint currently fails:** two existing components synchronously reset state inside effects (`forward-dialog.tsx`, `mobile-message-menu.tsx`). There are also seven raw `<img>` warnings. These are not production-build blockers, but should be corrected and made CI-blocking.
- **Dependency advisory check was inconclusive:** the npm advisory endpoint did not return during two attempts. Run `npm audit --omit=dev` in CI with network access and fail on high/critical production advisories. Several non-security package updates are available; update in small tested batches.

### Low / maintainability

- `chat-view.tsx` is a very large, state-heavy component. Split message list, composer, realtime reducer, and dialogs; memoize message rows before conversation sizes become large.
- Several Status components are compressed into very long source lines, making review and defect isolation harder.
- Product/database comments and internal identifiers still contain legacy “Maddy Chats” names. This is not a runtime defect but increases operational confusion after the ZipTalk rebrand.
- The raw image warnings should be evaluated individually. Blob previews may need plain `<img>`, but persistent avatars/backgrounds should use an optimized image path where authorization and cost allow it.

## Controls that are already good

- API authorization checks membership/ownership on protected chat, group, status, and media operations.
- All discovered mutation route modules now use the shared same-origin guard.
- Drizzle parameterization is used; no dynamic `eval`, `Function`, or shell execution was found.
- Passwords are bcrypt-hashed; password resets are hashed, expiring, single-use, and revoke old sessions.
- Session cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS.
- Upload names are sanitized, storage names are server-generated, traversal is checked, risky executable/web extensions are denied, sizes are capped, and media reads re-check authorization.
- Message history is cursor-paginated and bounded (30 default, 50 maximum).
- Sensitive database tables have RLS enabled and privileges revoked from public Supabase-style roles.
- `.env`, key formats, dumps, backups, database files, logs, and uploaded media are excluded by `.gitignore`.
- Error responses generally avoid leaking internal exception details.

## Verification performed

- `npm run typecheck` — passed.
- `npm run build` — passed; all 18 static pages generated and 58 API modules compiled.
- `git diff --check` — passed.
- Mutation-route scan — no remaining mutation module without `guardSameOrigin`.
- Tracked secret/data scan — no credential signature or data dump found; only migration SQL and `.env.example` matched tracked sensitive-file categories.
- `npm run lint` — failed on the two pre-existing React effect errors and reported seven image warnings described above.

## Recommended execution order

1. Replace one-second database polling and introduce distributed rate limiting.
2. Add authorization/security integration tests and make typecheck, lint, tests, build, and dependency audit required CI checks.
3. Replace hardcoded admin email with database roles plus MFA/re-authentication and audit logs.
4. Add file signature checks/transcoding/malware scanning and an enforceable upload-retention policy.
5. Add rotating device sessions, then roll out a report-only CSP and enforce it after validation.
6. Profile real mobile sessions (Core Web Vitals, React Profiler, database query timing) before further micro-optimization.

This was a static/code-path audit plus production build verification, not a penetration test or load test. Those require an isolated staging deployment, test accounts, controlled attack traffic, and database observability.
