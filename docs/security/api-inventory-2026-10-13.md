# API security inventory — 2026-10-13

Static entrypoint inventory; authorization helpers also enforce membership, ownership, device binding and privacy deeper in the server layer. Absence of a direct helper is not itself a vulnerability. Token-authenticated sign-in/recovery, probes and CSP reports intentionally differ.

| Route | Methods | Direct auth guard | Origin guard | Bounded JSON/upload | Direct limiter |
|---|---|---|---|---|---|
| /api/admin/activity | GET | requireAdmin | True | False | False |
| /api/admin/audit-log | GET | requireAdmin | True | False | False |
| /api/admin/messages/[id] | DELETE | authorizeAdminMutation | True | True | False |
| /api/admin/messages | GET | requireAdmin | True | False | False |
| /api/admin/reports | GET, PUT | authorizeAdminMutation, requireAdmin | True | True | False |
| /api/admin/security/login-history | GET | requireAdmin | True | False | False |
| /api/admin/security/retention | GET | requireAdmin | True | False | False |
| /api/admin/stats | GET | requireAdmin | True | False | False |
| /api/admin/storage | GET | requireAdmin | True | False | False |
| /api/admin/users/[id] | DELETE, GET, PATCH | authorizeAdminMutation, requireAdmin | True | True | False |
| /api/admin/users | GET, PATCH | authorizeAdminMutation, requireAdmin | True | True | False |
| /api/app-version | GET | token/public; manually reviewed | False | False | False |
| /api/auth/forgot-password | POST | token/public; manually reviewed | True | True | True |
| /api/auth/google/callback | GET | getSessionUser | False | False | False |
| /api/auth/google/native | GET, POST | token/public; manually reviewed | True | True | True |
| /api/auth/google | GET | getSessionUser | False | False | False |
| /api/auth/login | POST | token/public; manually reviewed | True | True | True |
| /api/auth/logout | POST | getSessionUser | True | False | False |
| /api/auth/me | GET | token/public; manually reviewed | False | False | False |
| /api/auth/methods | GET | getSessionUser | False | False | False |
| /api/auth/mfa | POST | token/public; manually reviewed | True | True | True |
| /api/auth/phone | POST | token/public; manually reviewed | True | True | True |
| /api/auth/register | POST | token/public; manually reviewed | True | True | True |
| /api/auth/resend-verification | POST | token/public; manually reviewed | True | True | True |
| /api/auth/reset-password | POST | token/public; manually reviewed | True | True | True |
| /api/auth/verify-email | POST | token/public; manually reviewed | True | True | True |
| /api/chat-capabilities | GET | getSessionUser | False | False | False |
| /api/communities/[id] | GET, POST | getSessionUser | True | True | False |
| /api/communities | GET, POST | getSessionUser | True | True | False |
| /api/conversations/[id]/accept | POST | getSessionUser | True | False | False |
| /api/conversations/[id]/background | PATCH | getSessionUser | True | True | False |
| /api/conversations/[id]/controls | POST | getSessionUser | True | True | False |
| /api/conversations/[id]/export | GET | getSessionUser | False | False | False |
| /api/conversations/[id]/files | GET | getSessionUser | False | False | False |
| /api/conversations/[id]/links | GET | getSessionUser | False | False | False |
| /api/conversations/[id]/media | GET | getSessionUser | False | False | False |
| /api/conversations/[id]/messages/[messageId]/pin | DELETE, POST | getSessionUser | True | False | True |
| /api/conversations/[id]/messages | GET, POST | getSessionUser | True | True | True |
| /api/conversations/[id]/pinned-messages | GET | getSessionUser | True | False | True |
| /api/conversations/[id]/read | POST | getSessionUser | True | False | False |
| /api/conversations/[id] | DELETE, GET | getSessionUser | True | False | False |
| /api/conversations/[id]/scheduled | DELETE, GET, POST | getSessionUser | True | True | True |
| /api/conversations/[id]/typing | POST | getSessionUser | True | True | True |
| /api/conversations | GET, POST | getSessionUser | True | True | True |
| /api/cron/process-scheduled | GET | token/public; manually reviewed | False | False | False |
| /api/e2ee/bootstrap | POST | getSessionUser | True | True | False |
| /api/e2ee/conversation-keys | GET, POST | getSessionUser | True | True | False |
| /api/e2ee/devices/approve | POST | getSessionUser | True | True | True |
| /api/e2ee/devices/link | GET, POST | getSessionUser | True | True | True |
| /api/e2ee/key-rotation/history | GET | getSessionUser | True | False | False |
| /api/e2ee/key-rotation/rotate | POST | getSessionUser | True | True | False |
| /api/e2ee/key-rotation/status | GET | getSessionUser | True | False | False |
| /api/e2ee/keys | GET, POST | getSessionUser | True | True | True |
| /api/e2ee/message-requests | GET | getSessionUser | False | False | False |
| /api/e2ee/peers | GET | getSessionUser | True | False | False |
| /api/e2ee/signal/bundle | GET | getSessionUser | True | False | False |
| /api/e2ee/signal/devices | DELETE, GET, POST | getSessionUser | True | True | False |
| /api/e2ee/signal/mailbox | GET, POST | getSessionUser | True | True | False |
| /api/e2ee/signal/send | POST | getSessionUser | True | True | False |
| /api/groups/[id]/avatar | POST | getSessionUser | True | True | False |
| /api/groups/[id]/invites | DELETE, GET, POST | getSessionUser | True | True | False |
| /api/groups/[id]/leave | POST | getSessionUser | True | False | False |
| /api/groups/[id]/members/[userId] | DELETE, PATCH | getSessionUser | True | True | False |
| /api/groups/[id]/members | POST | getSessionUser | True | True | False |
| /api/groups/[id]/settings | PATCH | getSessionUser | True | True | False |
| /api/groups/[id]/transfer | POST | getSessionUser | True | True | False |
| /api/groups | POST | getSessionUser | True | True | False |
| /api/health | GET | token/public; manually reviewed | False | False | False |
| /api/media/[...path] | GET | getSessionUser | False | False | False |
| /api/messages/[id]/reactions | DELETE, POST | getSessionUser | True | True | True |
| /api/messages/[id] | DELETE, PATCH | getSessionUser | True | True | True |
| /api/messages/[id]/star | DELETE, POST | getSessionUser | True | False | True |
| /api/messages/transcribe | POST | getSessionUser | True | True | True |
| /api/notifications/[id]/read | PATCH | getSessionUser | True | False | False |
| /api/notifications/preferences | GET, PATCH | getSessionUser | True | True | False |
| /api/notifications/push | DELETE, POST | getSessionUser | True | True | False |
| /api/notifications | GET, PATCH | getSessionUser | True | False | False |
| /api/privacy/2fa/recovery | POST | getSessionUser | True | True | True |
| /api/privacy/2fa/setup | POST | getSessionUser | True | True | True |
| /api/privacy/2fa/status | GET | getSessionUser | True | False | False |
| /api/privacy/2fa/verify | DELETE, POST | getSessionUser | True | True | True |
| /api/privacy/delete-account | POST | getSessionUser | True | True | True |
| /api/privacy/devices | DELETE, GET | getSessionUser | True | True | True |
| /api/privacy/export | GET | getSessionUser | True | False | False |
| /api/privacy/login-history | GET | getSessionUser | True | False | False |
| /api/privacy/settings | GET, PUT | getSessionUser | True | True | False |
| /api/push/register | DELETE, POST | getSessionUser | True | True | True |
| /api/ready | GET | token/public; manually reviewed | False | False | False |
| /api/realtime/stream | GET | getSessionUser | False | False | False |
| /api/reports | POST | getSessionUser | True | True | True |
| /api/scheduled/process | POST | getSessionUser | True | False | False |
| /api/search/messages | GET | getSessionUser | False | False | True |
| /api/security/csp-report | POST | token/public; manually reviewed | False | True | True |
| /api/status/[id]/reaction | POST | getSessionUser | True | True | False |
| /api/status/[id]/reply | POST | getSessionUser | True | False | False |
| /api/status/[id] | DELETE | getSessionUser | True | False | False |
| /api/status/[id]/view | POST | getSessionUser | True | False | False |
| /api/status/[id]/viewers | GET | getSessionUser | False | False | False |
| /api/status | GET, POST | getSessionUser | True | True | False |
| /api/upload/avatar | POST | getSessionUser | True | True | True |
| /api/upload/message | POST | getSessionUser | True | True | True |
| /api/users/[id]/block | DELETE, POST | getSessionUser | True | False | False |
| /api/users/[id] | GET | getSessionUser | False | False | False |
| /api/users/me | GET, PATCH | getSessionUser | True | True | True |
| /api/users/me/starred-messages | GET | getSessionUser | False | False | False |
| /api/users/search | GET | getSessionUser | False | False | True |
