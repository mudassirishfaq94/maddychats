# Circlo security audit — 13 October 2026

## Scope and release status

Baseline: production branch `codex/audit-remainder-20261009`, commit
`8028656679b554caafc416ca8c3f4f1158539c57`. The merged main branch has identical
files at the start of this audit. Render still deploys the production branch.

Reviewed the HTTP/session helpers, privileged guards, all 11 administrative API
route files, selected auth/chat/media/community endpoints, deployment headers,
password hashing, client-variable references, dependency policy, database
settings, 106-route static inventory, and reachable Git history. Existing
isolated authorization, security, browser and integration tests provide
additional behavioral coverage. A static inventory is not proof that every
route or method is secure.

Public probes were low-volume, read-only requests without production user
cookies. No destructive tests or credential guessing against real users were
performed. This is an engineering audit, not a formal cryptographic review
or a guarantee against every attack.

## Findings and fixes

| ID | Priority | Finding | Fix / status |
| --- | --- | --- | --- |
| SEC-01 | High | Experimental Signal send path independently inserted messages without enforcing the normal blocked-contact, message-request, deleted-group and group messaging rules. | Quarantined the experimental send endpoint with 503; no deployment toggle can re-enable it. The supported encrypted message endpoint remains available. Regression added. |
| SEC-02 | High, configuration-dependent | No versioned protection prevented Supabase Data API roles from reaching application tables if provider-default grants existed. Live grants could not be inspected. | Scoped migration enables RLS and revokes PUBLIC/anon/authenticated grants on the 45 application tables. Owner-based server access remains available. Tests simulate anonymous and authenticated Data API roles and an accidental future SELECT grant. Live status remains unverified until migration and runtime-role checks. |
| SEC-03 | Medium | Origin guard compared hostnames and ports, allowing an HTTP origin for an HTTPS deployment. | Compare complete origins, including scheme, and reject opaque origins, credentials, path/query/hash tricks and suffix domains. |
| SEC-04 | Medium | Several authenticated mutation endpoints had no route-local limiter. Administrative reads lacked a shared access budget. | Added a PostgreSQL-backed account-bound proxy budget of 240 operations per minute for non-auth mutations and admin reads; route-specific tighter limits remain. Logout is excluded. Password login also has an independent 25-attempt/10-minute account budget. |
| SEC-05 | Medium | Administrative reads allowed privileged accounts that had not enrolled MFA. Administrative layout was only a client-side gate. | Shared admin guards now require enrolled MFA. Server layout gates access before rendering the admin shell. Existing mutation step-up and role locks remain. |
| SEC-06 | Low | Private admin/API error responses lacked explicit no-store headers. | Added private no-store for API responses and generic errors, retaining the existing no-store version endpoint. |
| SEC-07 | Low | Invalid database pool values could become NaN or permit excessive connection capacity. | Validate configuration and cap the pool at 20, with a safe default of 5. |
| SEC-08 | Informational | Environment values and cloud-provider restrictions were inaccessible through connected tools. | Added a local server-only environment review command that prints names/states, never values. It does not claim to validate provider restrictions. |
| SEC-09 | Informational | Browser credential leakage needs build-level verification. | Added fake server-credential canaries during the CI build and scan the browser output; browser source maps are explicitly disabled. |
| SEC-11 | Medium | Streamed body readers enforced bytes but had no read deadline. | Added a 30-second deadline and cancellation, with stalled/oversized/valid stream tests. |\n| SEC-12 | Low | Private media explicitly permitted one-hour browser caching and logged attachment paths. | Changed its response to private no-store and removed the unconditional debug log. Member/outsider tests also verify the cache header. |\n| SEC-10 | Informational | Secret scanner flagged six historical/current matches. | Reviewed four disposable test credentials, a Cargo dependency name and a Firebase Android client key. No server credential identified in these matches. Firebase restrictions remain a provider-side check. |

## Existing controls confirmed

- Passwords use native async bcrypt with cost 12 and bounded worker concurrency.
  Registration validation handles bcrypt's 72-byte limit.
- User permissions are checked on the server; primary session resolution checks
  fresh database state, suspension, device revocation, token revocation and MFA.
- Admin roles come from the database, not editable profile metadata.
- Privileged writes require MFA, fresh proof and transactional role checks.
- Auth and other high-risk endpoints use a fail-closed shared PostgreSQL limiter.
- JSON and multipart bodies have streamed byte caps; UUIDs and form data are
  validated. SQL uses parameterized Drizzle/SQL expressions in reviewed paths.
- Uploaded names/types are constrained, readable media is decoded/re-encoded,
  and production readable uploads fail closed without scanning.
- Source files ignore env files, signing keys, database dumps, logs and uploads.
- The live website enforced nonce-based CSP, HSTS, nosniff, framing restrictions,
  referrer policy and permission restrictions during this audit. It did not
  expose X-Powered-By on the sampled pages.
- All tested sensitive public paths returned 404:
  /.env, /.env.local, /.git/HEAD, /.git/config, /package.json,
  /package-lock.json and /server/uploads/.
- Unauthenticated /api/admin/users, /api/admin/stats and /api/privacy/export
  returned 401 during the sampled checks.
- Client-visible variable references were limited to app version, starter mode,
  Firebase web configuration and the public VAPID key. These public identifiers
  are not equivalent to private provider credentials.

## XSS and input handling

React text rendering and server-side validation must remain the default.
Do not strip arbitrary characters from encrypted payloads: that corrupts
ciphertext and does not replace context-aware escaping. The source-sink inventory found no dangerouslySetInnerHTML, innerHTML, eval or new Function sinks in the scanned src files. A browser regression injects an HTML-looking display name and verifies it renders as text without executing. This scan does not replace review of every URL or CSS context.
Production CSP does not permit general eval or inline scripts. Its inline-style
exception is retained because the app uses dynamic styles.

## Git-history scan

A SHA256-verified Gitleaks 8.30.1 binary scanned all fetched reachable branch
history and the current tree. Only rule/path/line/commit/fingerprint metadata
was emitted; secret values and matched content were not retained in artifacts.
No history rewrite was performed. A scanner can miss unknown credential formats,
deleted/unreachable objects, external forks, or credentials outside Git.

Firebase's Android/web API key is a public client configuration identifier.
It still needs Firebase security rules, allowed domains and appropriate Google
API/application restrictions. Provider console access was unavailable, so
restrictions and billing quotas were not verified.

## Dependencies

The lockfile was recently regenerated and the prior complete suite passed.
The audit distinguishes production findings from the narrowly reviewed,
time-limited development-tooling exception in
`dependency-audit-exceptions.json`. Do not use `npm audit fix --force` to
silently introduce breaking versions. A high-risk exception is not a clean
all-dependency audit; review or upgrade the affected development tooling before
the exception expires.

Dependency removals must be based on actual imports and build/platform usage.
Capacitor packages may be required by the Android build even without direct
application imports. No platform dependency is removed just because a source
search finds no import.

## Environment and deployment checks still required

Run in the real server environment:
```bash
node scripts/check-security-env.mjs
```
Do not paste the underlying values into chat or a public issue.

Before deploying the database migration:
1. Confirm DATABASE_URL belongs to Circlo and the runtime role owns the 45
   application tables (or has an explicitly reviewed bypass/design). A
   non-owner runtime role without policies would be blocked by RLS.
2. Confirm remote DB connections actually use TLS with certificate validation;
   a URL check alone cannot prove effective driver behavior.
3. Confirm the media bucket is private and the service-role key stays server-only.
4. Confirm no unrelated clients legitimately rely on direct Data API table access.
5. Apply/test the migration in a staging copy first and retain a usable backup.

Also verify in provider dashboards:
- Unique JWT_SECRET, CRON_SECRET and HEALTHCHECK_SECRET; no public secret variables.
- CLIENT_URL=https://circlo.chat, NODE_ENV=production, CSP_ENFORCE=1.
- LOGIN_PERFORMANCE_DIAGNOSTICS and PROFILE_BUILD disabled for public releases.
- Correct restricted Resend sender key; correctly scoped Google/Firebase keys.
- Private storage policies and least-privilege database/network credentials.
- GitHub branch protection and account MFA.

The available Render connector cannot read environment-variable values.
The connected Supabase account did not list a Circlo project. No unrelated
database was inspected or modified.

## Validation

The pull request's CI run is the source of truth for final pass/fail status.
Required checks cover clean installation, lint, types, production build,
dependency policy, scanner integration, unit and isolated integration suites,
admin MFA and authorization, verification/recovery, session behavior, Signal
quarantine, Data API role denial, browser secret canaries, landing responsiveness,
and container readiness.

## Remaining limitations

- Provider-side credentials/restrictions, actual production DB privileges,
  storage RLS and network allowlists require the correct account access.
- No formal review of the custom cryptographic protocol has been performed.
  Quarantining the experimental send path does not establish the security of
  every encryption implementation.
- Rate limits are abuse controls, not protection against every volumetric DDoS.
- RLS table-owner access is intentional for this server-auth architecture;
  migrating to a non-owner app role requires explicit per-operation policies.
- Historical or externally copied credentials are not made safe by deleting
  files. If any genuine private leak is later confirmed, revoke/rotate it first.
