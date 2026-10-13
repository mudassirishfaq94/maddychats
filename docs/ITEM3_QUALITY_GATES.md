# Task 3: automated quality and authorization checks

The `Quality` GitHub Actions workflow runs on pull requests, pushes to
`main`/`master`, and manual dispatch. It uses Node 22, a disposable PostgreSQL 16
service, `npm ci`, strict lint (zero warnings), type checking, a production
build, dependency audits, and all supported tests. The workflow requires no
production secrets and cannot deploy. Its token has read-only repository access.

After committing/pushing the workflow, configure the branch ruleset to require
the check **Lint, types, build, security and integration** before merging.
Adding a workflow alone does not enable branch protection. The workflow has
been checked locally; a hosted Actions run requires pushing the changes.

## Supported test suites

| Command | Coverage |
| --- | --- |
| `npm run test:unit` | Safe same-origin reload destinations and fail-closed dependency exception rules |
| `npm run test:item1` | Email verification, MFA challenges, factor/recovery replay, fresh authentication, session revocation, encrypted transcript policy, account deletion |
| `npm run test:item2` | Fresh and upgraded migrations, schema parity, DB outage/readiness, independent scheduled delivery, real dump/restore |
| `npm run test:item3` | Real production HTTP routes: membership, CSRF, blocked sends, group roles, pagination bounds/cursors, private attachment access, deletion and session revocation |
| `npm run test:items4-6` | Upload/retention safety, device sessions, CSP and mobile profiling; see the tasks 4–6 guide for its additional disposable DB and browser setup |
| `npm run test:remaining` | Notification-driven realtime, recovery/isolation, administrative MFA/permissions, immutable audit and fail-closed abuse limits; uses loopback `remaining_hardening_test` |
| `npm test` | All supported suites, in the order above |

Tests seed verified accounts directly in disposable databases; they do not
send real verification emails or require OAuth/Firebase/Supabase credentials.
The new HTTP authorization suite logs in through the actual password endpoint
and sends the returned session cookie. It does not mock application permissions.
Media fixtures contain test bytes and are removed afterward. Legacy ad hoc
scripts, including placeholder cryptographic "security" tests, are not included
or credited as successful security validation. These tests do not replace an
independent cryptographic review or browser/device testing.

## Running locally

Use Node 22 and PostgreSQL 15 or newer. Install matching/newer PostgreSQL client
tools for the restore drill. Set `PG_BIN` if they are not on PATH. The test role
must be able to create disposable databases and install `pg_trgm`.

Start a separate local PostgreSQL instance and use test-only credentials:

```powershell
$env:PGHOST='127.0.0.1'
$env:PGPORT='5432'
$env:PGUSER='test_operator'
$env:PGPASSWORD='disposable-test-password'
$env:DATABASE_URL='postgresql://test_operator:disposable-test-password@127.0.0.1:5432/item1_security_test'
$env:ITEM1_TEST_DATABASE_URL=$env:DATABASE_URL
$env:ITEM2_TEST_DATABASE_URL='postgresql://test_operator:disposable-test-password@127.0.0.1:5432/item2_deployment_test'
$env:ITEM3_TEST_DATABASE_URL='postgresql://test_operator:disposable-test-password@127.0.0.1:5432/item3_authorization_test'
npm ci
createdb item1_security_test
npm run db:migrate
npm run lint
npm run typecheck
npm run audit:dependencies
npm run build
npm test
```

Prepare `item1_security_test` once; do not repeat `createdb` for an existing
test database. All integration suites require explicit loopback URLs and exact
test database names. They are destructive within those databases: item #1
resets fixtures/security columns, item #2 recreates its three test databases,
and item #3 recreates `item3_authorization_test`. Never substitute an application
database. HTTP servers bind only to loopback ports 3107–3109. Complete the build
before running integration tests; rebuilding concurrently removes the standalone
server that the tests execute.

## Dependency policy

Next and its ESLint configuration are pinned together at 16.3.8. Compatible
transitive updates address the flagged image, source-map, brace-expansion and
gRPC packages. Firebase's Firestore package pins gRPC to an older minor range;
the targeted override selects patched 1.13.6 without downgrading Firebase or
changing the unrelated server Firestore/gRPC dependency path.

`npm audit --omit=dev --audit-level=high` is a strict production gate. The full
audit also blocks high/critical findings, with one time-limited development
exception recorded in `dependency-audit-exceptions.json`: `braces@3.0.3`,
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The advisory has no published patched version. Its affected path is the Next
ESLint glob matcher. The exception expires on **8 November 2026 UTC**.

This is an accepted development-tool risk, not a patched vulnerability. Five
package findings can represent that one transitive root cause. The audit gate
accepts them only when every affected node is development-only, the exact
advisory/version matches, and the exception is unexpired. Production nodes,
critical findings, other advisories, changed versions and registry errors block
CI. Unit tests exercise these rejection conditions. CI has a bounded runtime
and a read-only token. Remove the exception when a compatible upstream patch
becomes available; expiry deliberately makes CI fail until reviewed.

## Lint repairs

Lint excludes generated caches, Android build output and wasm-bindgen artifacts,
while keeping application source and scripts checked. Rendering no longer reads
the decryption-failure ref; React state carries that visible status. Lightbox
and avatar failures track their actual URL, and mobile menu state resets by
unmounting. Admin fetches abort on unmount. Internal invite links use Next Link.
Image components fetch authenticated media directly with `unoptimized`, keeping
cookies and locally decrypted blob URLs out of the public image optimizer.
Full reloads remain intentional after auth changes and are constrained to the
current application origin.

The HTTP suite also caught deletion retries returning 500 because Drizzle
wraps duplicate-key errors. Delete-for-me now uses an atomic conflict-aware
insert; repeated and concurrent retries return success with one deletion row.
