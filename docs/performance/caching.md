# Caching audit and implementation

The implementation uses the existing Next 16.3.8 data cache and HTTP cache headers. It adds no dependency or managed service and costs $0 in additional hosting subscriptions. The current Render web service is a single instance; its local Next cache can disappear on restart, which safely causes a database miss. Render web-service HTML is not assumed to have a CDN cache.

## Cache inventory

| Result | Location / key | Lifetime | Invalidation |
| --- | --- | --- | --- |
| Public community directory (20 public rows by default) | Next `unstable_cache`; versioned public-directory prefix plus function arguments, including limit | 60 seconds | `revalidateTag(tag, { expire: 0 })` after successful community creation, self-account deletion, or admin account deletion |
| `/brand/*` public logo images | Browser and standards-compliant HTTP caches, keyed by URL | One hour, then mandatory revalidation | Expiry; use a new filename or versioned URL when immediate brand replacement is required |
| Compiled JS/CSS/fonts under `/_next/static` | Existing Next immutable asset caching | Existing framework defaults | Content-hashed filenames change on build |
| Session lookup within one server render | Existing React request-scoped cache | One request | Ends with the request |

The public directory wrapper checks the stored snapshot's expiry itself. Next may otherwise return stale data while refreshing; expired snapshots are never returned by this wrapper. A direct SQL edit bypassing application invalidation becomes visible on the first request after 60 seconds. Errors are not converted into cached empty results. Dates are restored to `Date` objects after Next's JSON serialization to preserve the server function's return contract.

Only directory fields already publicly listed are shared. The combined `/api/communities` response remains `private, no-store`: it includes fresh per-user memberships and passes fresh session/device authorization on every request. The membership query now uses Drizzle `inArray`, correcting its previous raw-array interpolation while retaining the same filter.

Brand images bypass session-refresh proxy work. They retain the configured security headers and cannot receive session cookies from the proxy. Their HTTP cache policy is deliberately not `immutable`, since existing filenames are not content hashed.

## Repeated work deliberately kept fresh

- Chat lists/history, unread counts, typing/presence, notifications, statuses, and message requests change frequently and depend on permissions or expiry.
- Login eligibility, suspension, device revocation, encryption keys/trust, MFA, recovery, rate limits, and upload quotas must reflect current security state.
- Account profiles, memberships and settings are private; no shared cache was added for them.
- CSP-nonce-bearing HTML remains dynamically rendered. Caching it as public HTML could reuse nonces or expose authenticated content.
- OAuth exchanges and outbound email are operations, not cacheable reads. Legacy voice transcripts are already persisted; encrypted transcripts stay device-local. No repeated server AI inference was found in that path.
- Release detection and readiness remain uncached so deployments and outages are visible promptly.

There is no evidence that Redis is necessary for this bounded directory cache. Before adding multiple web instances, implement a shared Next cache handler and cross-instance tag invalidation rather than relying on independent local caches. Any future community edit, visibility toggle or deletion endpoint must invalidate the same directory tag after committing its change. Visibility and membership authorization must never consult the public cache.

## Verification

`scripts/test-public-cache.mjs` starts the actual production standalone build against an explicitly supplied disposable loopback database ending in `_test`. It creates 100,000 synthetic public communities and two separate device sessions, then cleans up its fixtures and stops its server.

It opens the actual Communities screen twice at a 390 × 844 mobile viewport, verifies identical responses, inspects the real Next cache file for public-only rows, and measures five alternating misses and hits after process startup. It tests separate private memberships in both accounts' screens, immediate creation invalidation on the other account's Browse screen, an actual 61-second expiry after a direct SQL edit, creator-ID invalidation after account deletion, rejection of anonymous/revoked devices despite a warm cache, and brand HTTP headers. Results are in `cache-verification.json`.

Verified on 2026-10-11:

| Measurement | First / miss | Repeat / hit |
| --- | ---: | ---: |
| Mobile screen ready (includes startup and browser warm-up) | 2,082.6 ms | 980.9 ms |
| Communities API median, five pairs after process warm-up | 151.2 ms | 37.6 ms |

The paired API result is approximately 75% faster with cached directory data. This is a synthetic scale test, not a claim that the whole live website becomes 75% faster. All freshness, privacy and revocation assertions passed. No production records were modified by these tests.

Run after `npm run build` with `CACHE_TEST_DATABASE_URL` pointing to a disposable local database containing the current schema, then `npm run test:cache`. The test generates its own signing secret; it never requires production credentials. Browser results are local production-build measurements, not measurements of the live Render deployment or low-end physical phones. First/second screen timings include browser and module warm-up; the five paired API timings separate those startup effects from data-cache behavior.

Production build/type checking, targeted ESLint and all 16 existing unit tests passed. These changes have not been deployed by this caching task.
