# API security inventory — 22 October 2026

127 route modules, 176 explicitly exported handlers. This is an AST-assisted inventory of authentication calls in each module, followed by focused manual tracing; it does not prove every branch or object authorization correct. Wrapper calls are included at module scope. Next.js automatically implements HEAD/OPTIONS where applicable. Session checks do not replace per-object checks.

| Route | Explicit methods | Authentication entry point / intended exception |
|---|---|---|
| [/api/admin/activity](../../src/app/api/admin/activity/route.ts) | GET | requireAdmin |
| [/api/admin/audit-log](../../src/app/api/admin/audit-log/route.ts) | GET | requireAdmin |
| [/api/admin/messages/[id]](../../src/app/api/admin/messages/[id]/route.ts) | DELETE | authorizeAdminMutation |
| [/api/admin/messages](../../src/app/api/admin/messages/route.ts) | GET | requireAdmin |
| [/api/admin/reports](../../src/app/api/admin/reports/route.ts) | GET, PUT | requireAdmin, authorizeAdminMutation |
| [/api/admin/security/login-history](../../src/app/api/admin/security/login-history/route.ts) | GET | requireAdmin |
| [/api/admin/security/retention](../../src/app/api/admin/security/retention/route.ts) | GET | requireAdmin |
| [/api/admin/stats](../../src/app/api/admin/stats/route.ts) | GET | requireAdmin |
| [/api/admin/storage](../../src/app/api/admin/storage/route.ts) | GET | requireAdmin |
| [/api/admin/users/[id]](../../src/app/api/admin/users/[id]/route.ts) | GET, PATCH, DELETE | requireAdmin, authorizeAdminMutation |
| [/api/admin/users](../../src/app/api/admin/users/route.ts) | GET, PATCH | requireAdmin, authorizeAdminMutation |
| [/api/app-version](../../src/app/api/app-version/route.ts) | GET | Public release metadata only |
| [/api/auth/change-password](../../src/app/api/auth/change-password/route.ts) | POST | getSessionUser |
| [/api/auth/forgot-password](../../src/app/api/auth/forgot-password/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/google/callback](../../src/app/api/auth/google/callback/route.ts) | GET | getSessionUser |
| [/api/auth/google/native](../../src/app/api/auth/google/native/route.ts) | GET, POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/google](../../src/app/api/auth/google/route.ts) | GET | getSessionUser |
| [/api/auth/login](../../src/app/api/auth/login/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/logout](../../src/app/api/auth/logout/route.ts) | POST | getDeviceSetupUser |
| [/api/auth/me](../../src/app/api/auth/me/route.ts) | GET | getSessionAccess |
| [/api/auth/methods](../../src/app/api/auth/methods/route.ts) | GET | getSessionUser |
| [/api/auth/mfa](../../src/app/api/auth/mfa/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/phone](../../src/app/api/auth/phone/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/register](../../src/app/api/auth/register/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/resend-verification](../../src/app/api/auth/resend-verification/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/reset-password](../../src/app/api/auth/reset-password/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/auth/verify-email](../../src/app/api/auth/verify-email/route.ts) | POST | Public authentication ceremony; proof/token and rate limits |
| [/api/calls/history](../../src/app/api/calls/history/route.ts) | GET | getSessionUser |
| [/api/calls/ice](../../src/app/api/calls/ice/route.ts) | GET | getSessionUser |
| [/api/calls](../../src/app/api/calls/route.ts) | GET, POST | getSessionUser |
| [/api/chat-capabilities](../../src/app/api/chat-capabilities/route.ts) | GET | getSessionUser |
| [/api/communities/[id]](../../src/app/api/communities/[id]/route.ts) | GET, POST | getSessionUser |
| [/api/communities](../../src/app/api/communities/route.ts) | GET, POST | getSessionUser |
| [/api/contacts/phone](../../src/app/api/contacts/phone/route.ts) | GET, POST | getSessionUser |
| [/api/contacts/qr](../../src/app/api/contacts/qr/route.ts) | GET | getSessionUser |
| [/api/contacts](../../src/app/api/contacts/route.ts) | GET, POST, DELETE | getSessionUser |
| [/api/conversations/[id]/accept](../../src/app/api/conversations/[id]/accept/route.ts) | POST | getSessionUser |
| [/api/conversations/[id]/background](../../src/app/api/conversations/[id]/background/route.ts) | PATCH | getSessionUser |
| [/api/conversations/[id]/controls](../../src/app/api/conversations/[id]/controls/route.ts) | POST | getSessionUser |
| [/api/conversations/[id]/export](../../src/app/api/conversations/[id]/export/route.ts) | GET | getSessionUser |
| [/api/conversations/[id]/files](../../src/app/api/conversations/[id]/files/route.ts) | GET | getSessionUser |
| [/api/conversations/[id]/links](../../src/app/api/conversations/[id]/links/route.ts) | GET | getSessionUser |
| [/api/conversations/[id]/media](../../src/app/api/conversations/[id]/media/route.ts) | GET | getSessionUser |
| [/api/conversations/[id]/messages/[messageId]/pin](../../src/app/api/conversations/[id]/messages/[messageId]/pin/route.ts) | POST, DELETE | getSessionUser |
| [/api/conversations/[id]/messages](../../src/app/api/conversations/[id]/messages/route.ts) | GET, POST | getSessionUser |
| [/api/conversations/[id]/pinned-messages](../../src/app/api/conversations/[id]/pinned-messages/route.ts) | GET | getSessionUser |
| [/api/conversations/[id]/read](../../src/app/api/conversations/[id]/read/route.ts) | POST | getSessionUser |
| [/api/conversations/[id]](../../src/app/api/conversations/[id]/route.ts) | GET, DELETE | getSessionUser |
| [/api/conversations/[id]/scheduled](../../src/app/api/conversations/[id]/scheduled/route.ts) | GET, POST, PATCH, DELETE | getSessionUser |
| [/api/conversations/[id]/typing](../../src/app/api/conversations/[id]/typing/route.ts) | POST | getSessionUser |
| [/api/conversations](../../src/app/api/conversations/route.ts) | GET, POST | getSessionUser |
| [/api/cron/process-scheduled](../../src/app/api/cron/process-scheduled/route.ts) | GET | matchesBearer |
| [/api/e2ee/bootstrap](../../src/app/api/e2ee/bootstrap/route.ts) | POST | getSessionUser |
| [/api/e2ee/conversation-keys](../../src/app/api/e2ee/conversation-keys/route.ts) | GET, POST | getSessionUser |
| [/api/e2ee/devices/approve](../../src/app/api/e2ee/devices/approve/route.ts) | POST | getDeviceSetupUser |
| [/api/e2ee/devices/link/code](../../src/app/api/e2ee/devices/link/code/route.ts) | POST | getSessionUser |
| [/api/e2ee/devices/link](../../src/app/api/e2ee/devices/link/route.ts) | GET, POST | getDeviceSetupUser |
| [/api/e2ee/devices/link/verify](../../src/app/api/e2ee/devices/link/verify/route.ts) | POST | getDeviceSetupUser |
| [/api/e2ee/devices/recovery-email](../../src/app/api/e2ee/devices/recovery-email/route.ts) | GET, POST | getDeviceSetupUser |
| [/api/e2ee/devices/sync](../../src/app/api/e2ee/devices/sync/route.ts) | GET | getSessionUser |
| [/api/e2ee/key-rotation/history](../../src/app/api/e2ee/key-rotation/history/route.ts) | GET | getSessionUser |
| [/api/e2ee/key-rotation/rotate](../../src/app/api/e2ee/key-rotation/rotate/route.ts) | POST | getSessionUser |
| [/api/e2ee/key-rotation/status](../../src/app/api/e2ee/key-rotation/status/route.ts) | GET | getSessionUser |
| [/api/e2ee/keys](../../src/app/api/e2ee/keys/route.ts) | GET, POST, PATCH | getDeviceSetupUser, getSessionUser, getSessionAccess |
| [/api/e2ee/message-requests](../../src/app/api/e2ee/message-requests/route.ts) | GET | getSessionUser |
| [/api/e2ee/peers](../../src/app/api/e2ee/peers/route.ts) | GET | getSessionUser |
| [/api/e2ee/recovery-backups](../../src/app/api/e2ee/recovery-backups/route.ts) | GET, PUT | getDeviceSetupUser, getSessionUser |
| [/api/e2ee/signal/bundle](../../src/app/api/e2ee/signal/bundle/route.ts) | GET | getSessionUser |
| [/api/e2ee/signal/devices](../../src/app/api/e2ee/signal/devices/route.ts) | GET, POST, DELETE | getSessionUser |
| [/api/e2ee/signal/mailbox](../../src/app/api/e2ee/signal/mailbox/route.ts) | GET, POST | getSessionUser |
| [/api/e2ee/signal/send](../../src/app/api/e2ee/signal/send/route.ts) | POST | Quarantined: unconditional 503, no data access |
| [/api/groups/[id]/avatar](../../src/app/api/groups/[id]/avatar/route.ts) | POST | getSessionUser |
| [/api/groups/[id]/invites](../../src/app/api/groups/[id]/invites/route.ts) | GET, POST, DELETE | getSessionUser |
| [/api/groups/[id]/leave](../../src/app/api/groups/[id]/leave/route.ts) | POST | getSessionUser |
| [/api/groups/[id]/members/[userId]](../../src/app/api/groups/[id]/members/[userId]/route.ts) | DELETE, PATCH | getSessionUser |
| [/api/groups/[id]/members](../../src/app/api/groups/[id]/members/route.ts) | POST | getSessionUser |
| [/api/groups/[id]/settings](../../src/app/api/groups/[id]/settings/route.ts) | PATCH | getSessionUser |
| [/api/groups/[id]/transfer](../../src/app/api/groups/[id]/transfer/route.ts) | POST | getSessionUser |
| [/api/groups/join](../../src/app/api/groups/join/route.ts) | POST | getSessionUser |
| [/api/groups](../../src/app/api/groups/route.ts) | POST | getSessionUser |
| [/api/health](../../src/app/api/health/route.ts) | GET | matchesBearer |
| [/api/media/[...path]](../../src/app/api/media/[...path]/route.ts) | GET | getSessionUser |
| [/api/messages/[id]/reactions](../../src/app/api/messages/[id]/reactions/route.ts) | POST, DELETE | getSessionUser |
| [/api/messages/[id]/reveal](../../src/app/api/messages/[id]/reveal/route.ts) | POST | getSessionUser |
| [/api/messages/[id]](../../src/app/api/messages/[id]/route.ts) | PATCH, DELETE | getSessionUser |
| [/api/messages/[id]/star](../../src/app/api/messages/[id]/star/route.ts) | POST, DELETE | getSessionUser |
| [/api/messages/delivery](../../src/app/api/messages/delivery/route.ts) | GET, POST | getSessionUser |
| [/api/messages/transcribe](../../src/app/api/messages/transcribe/route.ts) | POST | getSessionUser |
| [/api/notifications/[id]/read](../../src/app/api/notifications/[id]/read/route.ts) | PATCH | getSessionUser |
| [/api/notifications/preferences](../../src/app/api/notifications/preferences/route.ts) | GET, PATCH | getSessionUser |
| [/api/notifications/push/delivery](../../src/app/api/notifications/push/delivery/route.ts) | GET | getSessionUser |
| [/api/notifications/push](../../src/app/api/notifications/push/route.ts) | GET, POST, DELETE | getSessionUser |
| [/api/notifications](../../src/app/api/notifications/route.ts) | GET, PATCH | getSessionUser |
| [/api/privacy/2fa/recovery](../../src/app/api/privacy/2fa/recovery/route.ts) | POST | getSessionUser |
| [/api/privacy/2fa/setup](../../src/app/api/privacy/2fa/setup/route.ts) | POST | getSessionUser |
| [/api/privacy/2fa/status](../../src/app/api/privacy/2fa/status/route.ts) | GET | getSessionUser |
| [/api/privacy/2fa/verify](../../src/app/api/privacy/2fa/verify/route.ts) | POST, DELETE | getSessionUser |
| [/api/privacy/delete-account](../../src/app/api/privacy/delete-account/route.ts) | POST | getSessionUser |
| [/api/privacy/devices](../../src/app/api/privacy/devices/route.ts) | GET, DELETE | getSessionUser |
| [/api/privacy/export](../../src/app/api/privacy/export/route.ts) | GET | getSessionUser |
| [/api/privacy/login-history](../../src/app/api/privacy/login-history/route.ts) | GET | getSessionUser |
| [/api/privacy/settings](../../src/app/api/privacy/settings/route.ts) | GET, PUT | getSessionUser |
| [/api/push/register](../../src/app/api/push/register/route.ts) | GET, POST, DELETE | getSessionUser |
| [/api/ready](../../src/app/api/ready/route.ts) | GET | matchesBearer |
| [/api/realtime/stream](../../src/app/api/realtime/stream/route.ts) | GET | getSessionUser, resolveSessionToken |
| [/api/reports](../../src/app/api/reports/route.ts) | POST | getSessionUser |
| [/api/scheduled/process](../../src/app/api/scheduled/process/route.ts) | POST | getSessionUser |
| [/api/search/messages](../../src/app/api/search/messages/route.ts) | GET | getSessionUser |
| [/api/security/csp-report](../../src/app/api/security/csp-report/route.ts) | POST | Public bounded report ingestion + IP quota |
| [/api/security/devices](../../src/app/api/security/devices/route.ts) | GET | getSessionUser |
| [/api/status/[id]/reaction](../../src/app/api/status/[id]/reaction/route.ts) | POST | getSessionUser |
| [/api/status/[id]/reply](../../src/app/api/status/[id]/reply/route.ts) | POST | getSessionUser |
| [/api/status/[id]](../../src/app/api/status/[id]/route.ts) | DELETE | getSessionUser |
| [/api/status/[id]/view](../../src/app/api/status/[id]/view/route.ts) | POST | getSessionUser |
| [/api/status/[id]/viewers](../../src/app/api/status/[id]/viewers/route.ts) | GET | getSessionUser |
| [/api/status](../../src/app/api/status/route.ts) | GET, POST | getSessionUser |
| [/api/temporary-rooms/[id]/events](../../src/app/api/temporary-rooms/[id]/events/route.ts) | GET | authorizeTemporaryRoom |
| [/api/temporary-rooms/[id]](../../src/app/api/temporary-rooms/[id]/route.ts) | GET, POST | authorizeTemporaryRoom |
| [/api/temporary-rooms](../../src/app/api/temporary-rooms/route.ts) | POST | Public create/join; room code + credential + IP quota |
| [/api/upload/avatar](../../src/app/api/upload/avatar/route.ts) | POST | getSessionUser |
| [/api/upload/message](../../src/app/api/upload/message/route.ts) | POST | getSessionUser |
| [/api/upload/staged](../../src/app/api/upload/staged/route.ts) | GET, POST, PUT | getSessionUser |
| [/api/users/[id]/block](../../src/app/api/users/[id]/block/route.ts) | POST, DELETE | getSessionUser |
| [/api/users/[id]](../../src/app/api/users/[id]/route.ts) | GET | getSessionUser |
| [/api/users/me](../../src/app/api/users/me/route.ts) | GET, PATCH | getSessionUser |
| [/api/users/me/starred-messages](../../src/app/api/users/me/starred-messages/route.ts) | GET | getSessionUser |
| [/api/users/search](../../src/app/api/users/search/route.ts) | GET | getSessionUser |
