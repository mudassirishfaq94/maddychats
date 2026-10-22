# Authentication attack matrix: 130 cases

Baseline: main `75398ff4bfac249f59607d26156393eb4d6cd685`. This is a code/isolated-test assessment, not 130 successful exploits or a live penetration test.

`existing control` identifies a reviewed control with an existing regression suite; it does not claim every variation was executed independently. `source reviewed` means code inspection, not a runtime proof. F1-F6 are remediations in this change; D1 is token-profile hardening. Deployment and residual rows remain explicitly open. The validation column identifies the suite or operational evidence needed; execution results belong in the audit report.

## Primary credentials

Source: `src/app/api/auth/login/route.ts; src/server/password.ts; src/server/device-sessions.ts`. Validation: `scripts/test-item1-security.ts; scripts/test-authentication-audit.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-001 | Unknown-user versus wrong-password response | existing control |
| AUTH-002 | Unknown-user bcrypt timing parity | existing control |
| AUTH-003 | Distributed guessing against one account | existing control |
| AUTH-004 | Per-source password guessing | existing control |
| AUTH-005 | SQL metacharacters in the login identifier | source reviewed |
| AUTH-006 | UTF-8 passwords beyond bcrypt byte 72 | existing control |
| AUTH-007 | Password-work queue exhaustion | existing control |
| AUTH-008 | Old password proof reused after password reset | F1 fixed |
| AUTH-009 | Suspension changed after primary verification | F1 fixed |
| AUTH-010 | Account changed while session issuance waits on a lock | F1 fixed |

## Registration and email proof

Source: `src/app/api/auth/register/route.ts; src/server/email-verification.ts; src/lib/schemas.ts`. Validation: `scripts/test-item1-security.ts; scripts/test-verification-codes.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-011 | Unverified password account bypasses email proof | existing control |
| AUTH-012 | Google email matching silently takes over an existing password account | existing control |
| AUTH-013 | Concurrent duplicate registration bypasses uniqueness | existing control |
| AUTH-014 | Oversized email or username input | existing control |
| AUTH-015 | Client omits required policy acceptance | existing control |
| AUTH-016 | Registration injects role or verification fields | source reviewed |
| AUTH-017 | Registration reveals whether an email is registered | R1 privacy tradeoff |
| AUTH-018 | Distributed guessing of a six-digit email code | existing control |
| AUTH-019 | Concurrent reuse of an email verification code | existing control |
| AUTH-020 | Verification code is moved to another account | existing control |

## Session JWT profiles

Source: `src/server/jwt.ts`. Validation: `tests/authentication-token-validation.test.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-021 | Modified signature or payload | automated regression |
| AUTH-022 | Unsigned JWT or unexpected token type | D1 hardened |
| AUTH-023 | Alternative HMAC algorithm under the same key | D1 hardened |
| AUTH-024 | JWT omits expiry | D1 hardened |
| AUTH-025 | Session JWT exceeds its permitted lifetime | D1 hardened |
| AUTH-026 | Wrong issuer or cross-purpose audience | automated regression |
| AUTH-027 | Malformed subject/session IDs reach UUID database casts | D1 hardened |
| AUTH-028 | Fractional, negative or future authentication timestamps | D1 hardened |
| AUTH-029 | Expired access cookie | automated regression |
| AUTH-030 | JWT role/username snapshot overrides the live database role | source reviewed |

## Browser and cookie boundaries

Source: `src/server/http.ts; src/server/session.ts; src/server/device-sessions.ts; src/proxy.ts`. Validation: `tests/security-boundaries.test.ts; scripts/test-item3-authorization.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-031 | JavaScript reads an HttpOnly session cookie | source reviewed |
| AUTH-032 | Forged forwarding headers downgrade production Secure cookies | existing control |
| AUTH-033 | Cross-site form submits an authenticated mutation | existing control |
| AUTH-034 | Forged Host expands the trusted-origin allowlist | existing control |
| AUTH-035 | Cross-site Fetch Metadata without Origin | existing control |
| AUTH-036 | Null, credential-bearing or path-bearing Origin | existing control |
| AUTH-037 | Missing Origin is treated as proof of identity | source reviewed |
| AUTH-038 | Cross-account Google linking through a GET navigation | existing control |
| AUTH-039 | Private API data is retained by a shared cache | existing control |
| AUTH-040 | Session tokens are exposed in normal login JSON responses | source reviewed |

## Session lifecycle

Source: `src/server/device-sessions.ts; src/server/session.ts; src/app/api/auth/logout/route.ts`. Validation: `scripts/test-session-query.ts; scripts/test-item1-security.ts; scripts/test-authentication-audit.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-041 | Database disclosure reveals plaintext refresh secrets | source reviewed |
| AUTH-042 | Refresh rotation races create independent valid generations | existing control |
| AUTH-043 | Concurrent refresh of the immediately previous token | existing control |
| AUTH-044 | Random refresh guesses force another device to log out | existing control |
| AUTH-045 | Refreshing indefinitely beyond the absolute device lifetime | existing control |
| AUTH-046 | Copied access cookie remains valid after per-device logout | existing control |
| AUTH-047 | Logout leaves an unfinished MFA challenge usable | F6 fixed |
| AUTH-048 | A user revokes another account session by ID | existing control |
| AUTH-049 | One server keeps cached authorization after another revokes it | existing control |
| AUTH-050 | Disabling MFA resurrects pre-enrollment cookies or refresh tokens | F3 fixed |

## Password recovery and changes

Source: `src/server/password-reset.ts; src/app/api/auth/change-password/route.ts; src/app/api/auth/forgot-password/route.ts`. Validation: `scripts/test-password-reset.ts; scripts/test-session-query.ts; scripts/test-item3-authorization.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-051 | Guessing a password-reset token | source reviewed |
| AUTH-052 | Database disclosure reveals usable plaintext reset tokens | source reviewed |
| AUTH-053 | Concurrent reuse of a reset token | existing control |
| AUTH-054 | A reset expires during expensive password hashing | existing control |
| AUTH-055 | Another outstanding reset link survives a completed reset | existing control |
| AUTH-056 | Password reset leaves old device sessions active | existing control |
| AUTH-057 | Password reset leaves pending MFA challenges active | existing control |
| AUTH-058 | Two password changes commit using the same old hash | existing control |
| AUTH-059 | Reset-email delivery timing reveals account existence | R2 residual side channel |
| AUTH-060 | Host injection poisons a password-reset email URL | existing control |

## MFA enrollment and management

Source: `src/server/two-factor.ts; src/app/api/privacy/2fa/verify/route.ts`. Validation: `scripts/test-item1-security.ts; scripts/test-authentication-audit.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-061 | An old session manages MFA without fresh credentials | existing control |
| AUTH-062 | Revoked or foreign actor session mutates MFA after route admission | F2 fixed |
| AUTH-063 | A restricted pending-device sign-in manages MFA | F2 fixed |
| AUTH-064 | Concurrent setup replaces the secret that was just enabled | F2 fixed |
| AUTH-065 | An invalid enrollment code enables the factor | existing control |
| AUTH-066 | The enrollment TOTP can immediately be replayed at login | existing control |
| AUTH-067 | MFA status returns the secret seed or recovery codes | source reviewed |
| AUTH-068 | Setup reveals an already-enabled factor seed | F2 fixed |
| AUTH-069 | Database disclosure reveals plaintext recovery codes | source reviewed |
| AUTH-070 | MFA removal retains authentication ceremonies and active sessions | F3 fixed |

## MFA sign-in and recovery codes

Source: `src/server/authentication.ts; src/server/two-factor.ts`. Validation: `scripts/test-item1-security.ts; scripts/test-authentication-audit.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-071 | A malformed challenge cookie selects an account | existing control |
| AUTH-072 | Password-only login receives an MFA-satisfied session | existing control |
| AUTH-073 | Expired MFA challenge accepts a valid code | existing control |
| AUTH-074 | Account revocation leaves an earlier challenge eligible | existing control |
| AUTH-075 | Many new challenges bypass the per-account MFA budget | existing control |
| AUTH-076 | Two requests consume the same recovery code | existing control |
| AUTH-077 | TOTP accepts arbitrary formatting or an excessive clock window | existing control |
| AUTH-078 | A challenge survives replacement of its enrolled factor | F2 fixed |
| AUTH-079 | A completed factor proof mints a cookie after password reset | F1 fixed |
| AUTH-080 | Reset/MFA completion takes user and challenge locks in opposite orders | F2 fixed |

## Web Google OAuth

Source: `src/app/api/auth/google/route.ts; src/app/api/auth/google/callback/route.ts; src/server/google-link-binding.ts`. Validation: `scripts/test-item3-authorization.ts; tests/auth-proxy-hardening.test.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-081 | Callback accepts mismatched or absent state | source reviewed |
| AUTH-082 | Authorization code is redeemed without its PKCE verifier | source reviewed |
| AUTH-083 | Redirect URI is supplied through a hostile request host | existing control |
| AUTH-084 | ID token nonce belongs to a different OAuth flow | source reviewed |
| AUTH-085 | Wrong Google issuer, audience or signature algorithm | D1 hardened |
| AUTH-086 | Old or future-issued Google proof is treated as fresh login | existing control |
| AUTH-087 | Google email is unverified | source reviewed |
| AUTH-088 | Google sign-in skips Circlo MFA | existing control |
| AUTH-089 | Linking switches account, session or OAuth state | existing control |
| AUTH-090 | A Google identity already linked to another user is stolen | source reviewed |

## Native Google and Firebase

Source: `src/app/api/auth/google/native/route.ts; src/server/google-mobile-handoff.ts; src/app/api/auth/phone/route.ts; android/app/src/main/java/app/ziptalks/android/MainActivity.kt`. Validation: `scripts/test-authentication-audit.ts; tests/mobile-policy.test.ts`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-091 | Native exchange trusts a token decoded without signature validation | automated regression |
| AUTH-092 | A native Google ID token mints sessions repeatedly | F4 fixed |
| AUTH-093 | Credential Manager retries produce the same cached proof | F4 client freshness |
| AUTH-094 | Native handoff omits expiry, type or bounded lifetime | D1 hardened |
| AUTH-095 | Stolen mobile handoff is used without its PKCE verifier | existing control |
| AUTH-096 | Unsigned mobile agreement bypasses policy acceptance | existing control |
| AUTH-097 | A ticket/verifier pair is exchanged twice across instances | existing control |
| AUTH-098 | A mobile ticket issued before account revocation resumes login | F5 fixed |
| AUTH-099 | Firebase proof has no phone, is revoked or has stale authentication | source reviewed; provider deployment unverified |
| AUTH-100 | One Firebase phone proof completes sign-in repeatedly | F4 fixed; shared primitive tested |

## Trusted devices and encrypted recovery

Source: `src/app/api/e2ee/keys/route.ts; src/app/api/e2ee/devices/approve/route.ts; src/app/api/e2ee/devices/link/verify/route.ts; src/app/api/e2ee/recovery-backups/route.ts`. Validation: `scripts/test-device-access.mjs; scripts/test-device-recovery-ui.mjs; scripts/test-encryption-devices.mjs`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-101 | Primary login skips persisted device approval | existing control |
| AUTH-102 | A pending-device session refreshes past its verification deadline | existing control |
| AUTH-103 | Account password alone replaces trusted-device private-key proof | existing control |
| AUTH-104 | Approval proof is moved to a different target fingerprint | existing control |
| AUTH-105 | A revoked source key still approves another device | source reviewed |
| AUTH-106 | A device link code is redeemed by another account | existing control |
| AUTH-107 | An expired or already-used device link code is accepted | existing control |
| AUTH-108 | Email device recovery code is moved between session/device/fingerprint | existing control |
| AUTH-109 | An empty trusted-device set silently authorizes replacement | existing control |
| AUTH-110 | An untrusted or foreign session overwrites a recovery backup | source reviewed |

## Authorization beyond login

Source: `src/server/session.ts; src/server/admin.ts; src/server/admin-authentication.ts; src/server/chat.ts; src/app/api/realtime/stream/route.ts`. Validation: `scripts/test-item3-authorization.ts; tests/integration/reliability.test.ts; .github/workflows/quality.yml`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-111 | Protected data depends only on the proxy redirect | existing control |
| AUTH-112 | Admin pages or APIs accept an administrator without MFA | existing control |
| AUTH-113 | Moderator assigns administrator roles or alters an administrator | existing control |
| AUTH-114 | A stale administrator role survives a role-change transaction | existing control |
| AUTH-115 | Browser-provided recipient/user ID overrides the authenticated actor | source reviewed |
| AUTH-116 | Device inventory or login history is read across accounts | existing control |
| AUTH-117 | A known conversation/message ID bypasses membership | existing control |
| AUTH-118 | Starred, pinned, file or notification routes restore cleared history | existing control |
| AUTH-119 | An established SSE connection ignores logout/suspension/MFA changes | existing control |
| AUTH-120 | Server credentials enter the client bundle | existing control |

## Deployment and residual exposure

Source: `src/server/config.ts; src/server/client-ip.ts; src/proxy.ts; docs/database/runtime-role.sql; .github/workflows/quality.yml`. Validation: `deployment evidence required; CI for configured fixtures`.

| ID | Attack case | Assessment |
|---|---|---|
| AUTH-121 | Production runs with a missing or short JWT signing key | source fails closed; live environment unverified |
| AUTH-122 | Production CSP remains report-only instead of enforced | deployment unverified |
| AUTH-123 | Proxy trust is configured for the wrong deployment path | deployment unverified |
| AUTH-124 | TLS/domain/Android app-link identity is misconfigured | deployment unverified |
| AUTH-125 | Database read compromise exposes server-readable TOTP seeds | R3 key-separation hardening |
| AUTH-126 | A new dependency or historical secret bypasses CI checks | existing control |
| AUTH-127 | Mail-provider account or sender-domain access is compromised | deployment unverified |
| AUTH-128 | Google/Firebase console credentials or APK signing identity are wrong | deployment unverified |
| AUTH-129 | Suspicious authentication activity has no operational alerting | deployment unverified |
| AUTH-130 | The physical APK uses a stale frontend or provider flow | device verification required |
