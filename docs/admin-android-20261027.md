# Private Android admin app — validation record

## Delivered code

Separate Android application `chat.circlo.admin`, version 1.0.0 (code 1), Android 8+. Opens the existing Circlo admin service without embedding credentials, assigning roles or changing authentication/E2EE. Native phone lock, origin-restricted browsing, explicit camera permission and user-selected report saving are included. The web changes add four-tab mobile navigation and an authenticated, uncached control room; its readings describe the current Node process and database query, not whole-VPS uptime or message latency. Admin routes omit unrelated chat/background providers while retaining device-key setup.

## Verification

- Production Next.js build: passed.
- ESLint and TypeScript: passed.
- Unit suite: 177 passed.
- Android release compile, shrink and package: passed.
- Android security-policy unit tests: 2 passed, 0 skipped.
- Android release lint: 0 errors, 10 warnings (including required WebView JavaScript, untranslated English strings and newer SDK/library availability). No lint baseline or error suppression added.
- APK identity/debug checks, zip alignment and APK signature verification: passed; release signed with the existing private release certificate. Private signing material remains outside Git.
- `npm run test:admin`: passed against disposable PostgreSQL via loopback SSH forwarding. Checks real HTTP authorization, MFA enrollment/session invalidation, cross-origin denial, moderator boundaries, fresh-auth and recovery-code replay, immutable transactional audit, abuse limits, nine authenticated pages, five API error/retry flows, responsive control-room widths 320/390/768/1440, and real JSON report download. Existing message-content restrictions remain checked.
- The broader `test:remaining` run passed its admin portion, then failed the existing 350-event realtime burst-delivery assertion. It is not reported as a passing full suite; that assertion remains unchanged in the full command. The dedicated admin command stops before the separate realtime section and does not replace the full CI command.
- Windows standalone server requests stalled; the same production build served correctly through Next's normal server. The Windows test runner uses that entry point; Linux CI still uses standalone. This does not verify Linux deployment.
- Android 17 emulator failed during OS startup; Android 16 emulator also failed to become usable. No physical phone was connected at packaging time. Installation, phone-lock/camera/export behavior on the user's phone and end-to-end sign-in remain pending.

## APK

`Circlo-Admin-1.0.0.apk`, 126659 bytes. SHA-256: `5ec0cb5f5737dc1f9033eb9d238d7ec482d4a5bc0cae5ed5028fb8a25e9fa1fa`.

The app points to `https://circlo.chat/app/admin`. Existing live admin features are available after an authorized sign-in. The new control room and navigation require this branch's web changes deployed; they have not been deployed. No production schema/data or hosting changes were performed for this admin app. Google sign-in opens the external browser and does not share its session with the embedded page; use existing email/username/password and the code app inside the APK.

No automatic restart/deletion tools, private-message decryption, push alerts or full native/offline rewrite are claimed. Keep the PR in draft pending realtime CI investigation and physical-device validation.


## Direct admin entry follow-up

The admin account is already permitted; the block was the shared post-login chat-device setup flow. Admin guards now accept an active, non-revoked primary-authenticated administrator/moderator with current MFA enrollment and a fresh sign-in even while that session remains unapproved for chats. Database roles, MFA, suspension/revocation and sensitive-write proof checks remain enforced. The existing unlinked-session 15-minute lifetime is unchanged. The existing mfaTime claim represents the verified enrollment epoch; freshness is checked against authTime without changing token semantics.

Login, MFA, returning sessions and already-open setup URLs route admin destinations to the guarded console. Admin pages do not initialize chat encryption. Ordinary chat routes/APIs still require device approval; no chat keys are created or approved. No email address is hardcoded as an access exception.

Follow-up validation: 179 unit tests, build, lint/types and the admin browser suite passed. Added actual password/MFA browser sign-in for both an admin and an ordinary user; legacy setup return, role removal, revoked sessions, old authentication and preserved chat restrictions are checked using real unlinked sessions rather than an approved-session fixture. A schema-compatible Bluehost build is being checked separately before rollout.
