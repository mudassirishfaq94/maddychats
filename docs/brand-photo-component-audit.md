# Circlo brand, photo upload and component audit

## Changes

The approved two-circle logo replaces the lock mark across the shared web component, landing/auth/chat/profile/admin surfaces, email artwork, browser favicon, PWA/maskable icons, offline screen, legacy icon URLs and existing Android launcher/splash source artwork. Icon URLs carry a version suffix and the offline cache has a new version. Existing installed Android packages need a rebuild/update to pick up bundled native artwork.

Profile, group-avatar and conversation-background routes were blocked by the starter upload gate and then by the missing scanner. Enabled media still requires `CHAT_MEDIA_ENABLED=1`. Scanner-equipped hosts retain mandatory scanning; scannerless starter photo routes reuse the existing permission-limited raster reconstruction worker. It checks signatures, rejects unsupported/non-image/oversized input, bounds pixels, time and concurrency, reads pixels, stores a fresh WebP without original metadata or trailing payload, and limits avatar/background dimensions to 1024. Authentication, ownership, rate limits, request bounds and private media access stay in place. Videos and arbitrary readable files are not enabled through this path.

The audit also found a no-op People retry button and silent community load/create/join/channel failures. Retry now issues a new request; aborted searches cannot replace newer results. Community requests handle HTTP failures and surface actionable feedback; create/join operations guard duplicate submissions. A private-community detail endpoint exposed member/channel metadata to non-members, and channel creation lacked an owner/admin check. Private reads now require fresh membership; channel creation checks owner/admin membership under a row lock and commits all related writes atomically. Tests reject outsiders and ordinary members, verify no forbidden channel was inserted, and allow an owner to create a channel. Public directory entries now include the correct public flag.

## Verification scope

- All component source files below were included in the source/error-path inventory. Lint/types and production build cover the complete web source; this is not a claim that every state of every component was manually exercised.
- Unit tests check consistent monochrome assets, reconstructed photo limits, spoofed/oversized input, metadata/trailing-payload removal and scanner fail-closed behavior.
- The isolated production-browser workflow covers real profile-photo upload, database persistence and normalized media retrieval; profile editing; group-avatar/background upload and outsider rejection; all eight main screens at 320px; actual People retry; community load/create failure feedback; private community access and successful channel creation.
- Existing suites cover sign-in/session/MFA/reset/verification, authorization/admin guards, chat request acceptance, encrypted text/media/voice, missing-key recovery, drafts and long-history mobile typing, device linking/revocation, statuses/audiences/expiry, scheduling, indexes and cache isolation.
- Functional live probes use only owned temporary accounts and uploads, with cleanup. No production load test is used for this change.

## External limitations

The live host has no configured email provider/sender, so real inbox delivery cannot be certified. Phone sign-in remains intentionally unavailable in starter mode. Actual notification-provider delivery, external Google consent and native device/hardware behavior require those configured providers/devices and are not established by local browser tests. Email/password enrollment for phone-only accounts is explicitly unavailable in the existing UI; it is not silently treated as implemented. No paid service was provisioned and no authentication/encryption guard was bypassed.

## Component source inventory

| Component | Lines inspected by source inventory |
| --- | ---: |
| `src/components/admin-authentication.tsx` | 21 |
| `src/components/auth/auth-layout.tsx` | 128 |
| `src/components/auth/field.tsx` | 64 |
| `src/components/auth/forgot-password-form.tsx` | 125 |
| `src/components/auth/google-sign-in.tsx` | 41 |
| `src/components/auth/login-form.tsx` | 113 |
| `src/components/auth/mfa-form.tsx` | 31 |
| `src/components/auth/phone-sign-in.tsx` | 82 |
| `src/components/auth/register-form.tsx` | 192 |
| `src/components/auth/reset-password-form.tsx` | 32 |
| `src/components/auth/verify-email-form.tsx` | 60 |
| `src/components/avatar.tsx` | 168 |
| `src/components/brand/logo.tsx` | 56 |
| `src/components/capacitor-deep-links.tsx` | 38 |
| `src/components/chats/attachment-composer.tsx` | 286 |
| `src/components/chats/attachments.tsx` | 434 |
| `src/components/chats/audio-message.tsx` | 241 |
| `src/components/chats/chat-actions-menu.tsx` | 199 |
| `src/components/chats/chat-view.tsx` | 3094 |
| `src/components/chats/chats-layout.tsx` | 412 |
| `src/components/chats/conversation-details.tsx` | 1500 |
| `src/components/chats/conversation-menu.tsx` | 244 |
| `src/components/chats/e2ee-context.tsx` | 190 |
| `src/components/chats/emoji-picker.tsx` | 216 |
| `src/components/chats/encrypted-message-state.tsx` | 41 |
| `src/components/chats/forward-dialog.tsx` | 259 |
| `src/components/chats/long-press-touchable.tsx` | 98 |
| `src/components/chats/message-actions.tsx` | 271 |
| `src/components/chats/message-search.tsx` | 205 |
| `src/components/chats/mobile-message-menu.tsx` | 289 |
| `src/components/chats/new-chat-dialog.tsx` | 157 |
| `src/components/chats/start-conversation-button.tsx` | 64 |
| `src/components/chats/sticker-picker.tsx` | 25 |
| `src/components/chats/voice-recorder.tsx` | 254 |
| `src/components/chats/waveform.tsx` | 197 |
| `src/components/hosted-app-updates.tsx` | 52 |
| `src/components/native-app-bridge.tsx` | 74 |
| `src/components/people/people-search.tsx` | 211 |
| `src/components/performance-monitor.tsx` | 52 |
| `src/components/profile/account-data.tsx` | 206 |
| `src/components/profile/authentication-methods.tsx` | 72 |
| `src/components/profile/devices.tsx` | 48 |
| `src/components/profile/e2ee-status.tsx` | 117 |
| `src/components/profile/encryption-devices.tsx` | 125 |
| `src/components/profile/fresh-authentication.tsx` | 20 |
| `src/components/profile/login-history.tsx` | 125 |
| `src/components/profile/notification-preferences.tsx` | 170 |
| `src/components/profile/privacy-settings.tsx` | 215 |
| `src/components/profile/profile-editor.tsx` | 344 |
| `src/components/profile/report-dialog.tsx` | 199 |
| `src/components/profile/two-factor-auth.tsx` | 260 |
| `src/components/providers/auth-provider.tsx` | 233 |
| `src/components/providers/e2ee-provider.tsx` | 51 |
| `src/components/providers/realtime-provider.tsx` | 289 |
| `src/components/pwa-update-prompt.tsx` | 89 |
| `src/components/shell/app-shell.tsx` | 135 |
| `src/components/shell/mobile-nav.tsx` | 66 |
| `src/components/shell/notification-bell.tsx` | 195 |
| `src/components/shell/sign-out-button.tsx` | 35 |
| `src/components/shell/user-menu.tsx` | 117 |
| `src/components/status/status-page.tsx` | 84 |
| `src/components/status/status-progress.tsx` | 28 |
| `src/components/theme-toggle.tsx` | 117 |
| `src/components/ui/toggle.tsx` | 62 |
