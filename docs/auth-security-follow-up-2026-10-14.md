# Authentication security follow-up — 14 October 2026

## Confirmed findings and changes

1. **Forged login IP / IP-limit bypass (confirmed on the deployed ingress).** Four low-volume requests used one disposable, verified fixture account. An injected `X-Forwarded-For` address was persisted as the login IP. This demonstrated control over the IP rate-limit key and audit attribution, not a bypass of the independent account/password checks. Other real users and mail were untouched; the fixture was removed.

   Render now uses a validated, canonical `CF-Connecting-IP`, selected only by its server-owned `RENDER=true` environment. Missing or malformed edge addresses use a shared `unknown` bucket; there is no fallback to attacker-prepended forwarding headers. Outside Render, production forwarding trust must be explicitly configured with `CLIENT_IP_TRUSTED_HOPS`; traversal starts at the trusted right end. Development header support remains separate.

   Deployment assumptions: [Render's ingress documentation](https://render.com/articles/how-render-handles-ddos-attacks), [Render's runtime environment](https://render.com/docs/environment-variables), [Cloudflare's header documentation](https://developers.cloudflare.com/fundamentals/reference/http-headers/). A forged Cloudflare identity header was rejected at the live edge in the probe. The final release must also pass the same controlled probe with the forged forwarding value ignored, a real non-unknown baseline, and unchanged IP attribution for accepted requests.

2. **Web Google OAuth abuse budgets missing.** Native Google already had an IP limit, but the web start/callback handlers lacked corresponding limits. Both now apply 25 requests per 10 minutes per trusted client IP before provider work, with 429, Retry-After and private no-store responses. Invalid state is rejected before callback provider work. The token exchange has a ten-second deadline.

3. **Google linking not bound to the initiating session.** Previously a callback used whichever account was signed in when it returned. Linking now requires recent authentication (five minutes), an active device session and an HttpOnly, HMAC-bound proof of user + session + OAuth state. Switching accounts, changing sessions, missing proof or expired freshness fails before Google token exchange. The profile/login explains how to sign in again and retry. Legitimate cross-site provider callbacks remain supported; cross-site initiation is rejected.

4. **bcrypt's byte-truncation behavior during verification.** Creation already rejected passwords longer than 72 UTF-8 bytes. Verification now rejects them too, instead of silently accepting a suffix after a valid 72-byte password. Existing valid in-range passwords and cost-12 hashing are unchanged. This is input hardening, not evidence that an attacker could log in without knowing the valid password prefix. A legacy overlong password must be reset to an in-range password.

## Verification

- 52 unit tests passed, including proxy header forgery/malformed input, explicit trusted-hop traversal, canonical IPv6 keys, account/session/state binding and multibyte password boundaries.
- Production HTTP authorization suite passed. The OAuth fixture uses generated RSA keys and signed Google-shaped test credentials to exercise actual start/callback handlers. It verifies successful linking and sign-in, rejects wrong audience/nonce, account switching, missing binding, stale authentication, cross-site initiation and exhausted budgets. Provider callbacks with cross-site navigation metadata succeed when valid.
- The fixture preload accepts only the named disposable loopback database and fake OAuth client, and denies other third-party fetches. No Google credentials, provider calls or mail are used by these tests.
- Existing mobile password-change, MFA, CSRF, session revocation, membership/role and private-media checks passed in that suite. Full CI and final live-version verification gate release completion.

## Boundaries

This is a targeted source and runtime review, not certification that the whole app has zero vulnerabilities. It does not replace an independent pentest. The previously requested Strix scan remains unavailable without credits. Generic authentication responses do not prove perfect timing indistinguishability, and signup still explicitly reports registered emails as an existing product behavior.

No schema migration, new infrastructure, paid service, weakened encryption or reduced password hashing cost is introduced.
