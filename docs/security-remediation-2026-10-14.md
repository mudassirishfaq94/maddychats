# Security remediation: 14 October 2026

## Runtime database role

Configure DATABASE_URL (and REALTIME_DATABASE_URL when separately configured) with circlo_runtime. Keep the owner connection in MIGRATION_DATABASE_URL for migrations and grant synchronization. scripts/start-production.mjs removes the migration variable before spawning Next.js. Never commit either credential.

docs/database/runtime-role.sql enrolls/synchronizes the private backend role. The role has no superuser, role/database creation, inheritance, or RLS bypass attributes and must not have unexpected memberships. Existing RLS receives an explicit private-server policy; the app continues enforcing per-user access. Public API roles do not gain access. Runtime audit events are SELECT/INSERT only. Schema creation, audit UPDATE/DELETE/TRUNCATE, and becoming the owner are tested as denied. Migration 0044 applies the audit restriction to existing enrolled deployments.

Owner credentials stored in the same hosting service are not a separate security boundary against arbitrary process/host compromise. A separately isolated migration runner and credential store would provide stronger isolation. This change reduces SQL/runtime privileges; it does not certify protection against arbitrary remote code execution.

Rollback: restore the owner connection as DATABASE_URL/REALTIME_DATABASE_URL in Render and deploy the previous version, leaving migration credentials intact. This restores broader privileges and should only be an emergency availability measure. Do not drop the runtime role while processes use it. Privilege synchronization is repeatable.

## Development braces dependency

GHSA-vfj7-8cjw-p6xm has no published compatible upstream patch as of this remediation. scripts/harden-braces.mjs applies a temporary checksum-verified guard to compile, expand and stringify recursive AST walkers during npm installation. All walks stop at 64 levels with a controlled error. Normal application/lint patterns preserve their output. Tests cover normal patterns and a 2,000-level input against every affected walker.

The installation hook rejects unknown package versions/content and is idempotent. Docker copies the hook before npm ci. Production-only installations without the development dependency skip it. Installs bypassing lifecycle hooks are not protected until the script is run; the unit tests fail if the patch is missing.

npm audit still reports the upstream 3.0.3 metadata. The exact development-only, expiring exception remains visible and describes the local patch. Do not claim the registry advisory is gone. Replace the local guard and exception when a compatible reviewed upstream fix exists. No production dependency is added.

## Audit coverage

Additional findings fixed during the wider review:

- Message reports accepted a message UUID without verifying visibility and accepted a caller-provided accused user. Reporting now checks membership, expiration, clearing and per-user deletion; derives the sender; validates report reasons, IDs and description length; and keeps responses private. Regression checks reject cross-conversation reports and invalid reasons and prevent a forged accused-user ID.

- Message editing changed the sender's row before the route checked current membership. A removed sender received HTTP 404 but the database content had changed. Deletion for everyone also lacked current membership enforcement. The regression checks responses and persisted text/deletion state. Both operations now require and lock current membership inside the mutation transaction, verify ownership before mutation, and reject expired/cleared history.

- Native FCM token registration retained the previous account when a physical device switched accounts. An isolated HTTP/SQL regression reproduced the wrong ownership. Registration now atomically transfers the token to the signed-in account, caps token length, and retains account-scoped deletion. Removal now also checks origin in the route as defense in depth; the existing proxy already rejected cross-origin writes. Tests cover account switching, previous-account deletion isolation, and foreign-Origin rejection without real push sends.
- Google mobile handoff tickets plus their PKCE verifier could be replayed during their valid lifetime. A local signed fixture produced two successful sign-ins. The shared store now consumes a hash of the valid ticket once, after verifier validation and before authentication, with a window longer than ticket validity. MFA still applies. Tests reject a wrong verifier, accept the first valid exchange, and reject replay.
- Community creation and membership/channel mutations had the general proxy write budget but lacked tighter feature-specific limits. They now also use the shared fail-closed database limiter (20 creations/hour, 60 mutations/minute) with Retry-After feedback. Tests cover private-community isolation, unauthorized channel creation, quota exhaustion and absence of writes on rejection. This is additional abuse hardening, not a demonstrated bypass of the existing global limiter.

Full CI runs authentication/authorization, admin MFA, replay, device trust/recovery, E2EE communication, CSRF, upload controls, private media, image/voice/status/composer flows, mobile layouts, scheduled delivery, session revocation, database-role boundaries and dependency/secret exposure checks using isolated fixture databases and mocked third-party transports.

Strix's connector was available but returned reauthentication required during this remediation. A Strix scan cannot start until that connection is restored. OS push receipt, actual email inbox receipt, external OAuth interaction and unrestricted infrastructure penetration remain outside the local fixture results. Passing these tests is not proof the site contains no other vulnerabilities.
