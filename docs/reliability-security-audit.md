# Circlo reliability and security audit — 2026-10-18

Status: implemented for review; local unit, database and Chromium workflows passed. Physical-device verification, remote CI and production rollout remain pending. No production changes applied. Base: 7f4b5da (includes recipient-device notification privacy). Work branch: codex/reliability-security-audit.

## Findings before implementation

| Feature | Confirmed finding | Classification |
|---|---|---|
| Groups | addGroupMember and settings/avatar APIs require admin role; settings/add UI hidden for members; no configurable add/edit permissions. Admin-only send already exists. | Hard-coded policy conflicts with requested default; missing controls |
| Background calls | Server-persisted WebRTC signaling and opaque PWA call pushes exist. Native pushes have no call-specific actions/channel/timeout; cancellation is webOnly. Active/incoming polling depends on SSE and browser lifecycle. STUN only, no relay. | Confirmed cancellation gap; missing native call UX; device reliability unverified |
| Scheduled messages | Worker uses SKIP LOCKED but uses the pre-lock scheduled row rather than locked job; no edit API/UI. Timestamp parsing accepts timezone-less input. STARTER_MODE intentionally pauses delivery unless explicitly enabled. | Confirmed concurrency/timezone gaps; missing edit feature; offline delivery needs integration tests |
| Disappearing messages | Read-side expireQuery marks deleted but retains ciphertext. Search, pinned/starred/reply paths have incomplete expiry checks. General maintenance does not globally expire messages on all deployments. | Confirmed retention and read-path gaps |
| Individual self-destruct | No per-message reveal/start/deadline model. | Missing feature |
| Key recovery | RSA identity/private-key backup is wrapped with random device secret stored in localStorage. Browser clear destroys that secret. File export and trusted-device enrollment exist. Hardware-storage helper is not evidence of deployed hardware protection; current native is hosted WebView. Registration catch can hide failures. | Confirmed usability/data-loss risk; missing cloud recovery UX; no means to recover keys never backed up |

## Prioritized implementation plan

1. Add centralized group policy, database defaults (members can add; admins control policy), backend transaction enforcement, accessible read-only settings and live metadata updates. Preserve owner-only ownership transfer and admin assignment.
2. Establish server-authoritative expiry/redaction on every read surface and bounded independent cleanup, including notification/cache/media paths. Build reveal-triggered fixed-five-second messages on that foundation; never send their contents to notification services or before recipient reveal.
3. Fix scheduled job claim/edit races, explicit timezone validation and edit/cancel UX. Test transactional exactly-once insertion and offline server processing using an isolated local PostgreSQL database.
4. Fix native call cancellation, expiry, call channel and supported action intents; retain persisted signaling during SSE disconnects and resume. Document PWA limits and STUN-only network limits. Do not request full-screen permissions or claim eligibility without a supported native calling integration and device verification.
5. Add client-encrypted cloud recovery envelopes protected by a random user-controlled recovery code with domain-separated strong derivation. Add setup/status/restore and unattended refresh after setup, without deriving from login passwords, sending the secret to the server, or silently overwriting device identities. Explicitly distinguish missing recovery from recoverable snapshots. Preserve trusted-device proof and existing encrypted files.
6. Verify isolated migrations, backend permissions, timer races, restart/idempotency, crypto tamper/wrong-secret behavior, lint/typecheck/unit/integration/E2E. Record physical-device checks as pending until performed.

## Migration and rollback plan (must be approved before production execution)

Additive migrations only: group permission flags; self-destruct reveal/deadline fields plus constraints/indexes; encrypted recovery envelope storage with owner-only authenticated access and private-table RLS; call state/outcome fields only if needed. Defaults preserve existing records and leave self-destruct disabled on old messages. No existing encryption identity or wrapped chat key is rewritten. New encrypted backup rows are a separate opt-in mechanism.

Apply only to a disposable local database during this task. Production rollout requires CI, reviewed SQL, backup/restore rehearsal and explicit approval. Deploy compatible readers before enabling new message modes. Roll back application behavior by disabling new creation paths; retain deadline enforcement and recovery data. Never revert to a reader that exposes expired content, drop recovery envelopes, or reverse destructive expiry cleanup. Before dropping additive columns in any future rollback, export encrypted rows and audit that no new-mode data remains. Cleanup deletes expired ciphertext, so the retention change requires explicit production approval; rollback cannot resurrect it.

## Security and platform implications

Group policy must be checked in database transactions at mutation time. No change grants regular members role escalation or other users' notification settings. Self-destruct provides server access expiry, not control over screenshots, external copies, malicious recipients or OS-retained notification history. Browser timers may run late while frozen; on resume clients must immediately honor the server deadline. Android call alerts require notification permission/channel access and a rebuilt matching APK. No force-stop, locked-device, background audio or full-screen guarantee is made without physical-device verification. Recovery requires a previously saved secret, viable trusted device, or other established recovery factor: email/Google authentication alone never decrypts history.

## Implementation report

### Groups

**Original problem/root cause:** membership additions and all group settings were hard-coded to administrator access in both API helpers and UI. There were no add/edit policy fields. Concurrent ownership changes could also leave multiple owners.

**Changes/files:** `src/lib/group-permissions.ts`, `src/server/chat.ts`, `src/server/group-invites.ts`, group members/settings/avatar/invites routes, `conversation-details.tsx`, schema/types, migration `0052_group_permissions.sql`. Every member can open group information and retain their own mute/leave controls. Members can add by default; edit information defaults to administrators. Administrators control add/edit/send policies. Policy and membership mutations use consistent database locks; ownership transfer/admin assignment remain owner-controlled. Existing conversation events refresh permissions in clients.

**Verified:** unit role/action matrix and real PostgreSQL additions, restricted/nonmember denials, information editing, policy escalation denial, invite authorization, concurrent ownership transfer, own mute isolation, owner leave protection and member leave. Chromium verified member group information/addition, live policy synchronization and backend restriction denials. The runner compares generated participant fingerprints and uses the existing verification UI after adding a participant.

**Security/readiness:** backend checks apply inside the mutation transaction. Migration is additive. Ready for review, not production rollout until remote CI, physical-device checks and migration approval.

### Incoming calls

**Original problem/root cause:** the app uses persisted WebRTC signaling with SSE, not Socket.IO. Native push had no dedicated call channel/actions, and cancellation excluded native devices. Reconnection relied too heavily on the realtime stream; expired signaling did not reliably create a missed-call outcome.

**Changes/files:** `src/server/call-push.ts`, calls API, `starter-maintenance.ts`, `realtime.ts`, `audio-call-provider.tsx`, `public/sw.js`, native payload utility; Android `NativeIncomingCall.kt`, `NativeCallDeclineReceiver.kt`, `NativePushState.kt`, `NotificationChannels.kt`, Firebase service, MainActivity and manifest. Persisted calls are polled while visible when realtime disconnects. PWA actions open the matching call with accept/decline intent. Android has a dedicated private high-importance incoming-call notification, answer/decline intents, cancellation and expiry. Account checks, per-call tags and bounded closed-call tombstones suppress stale/duplicate invites. Offline decline closes the local alert; the server still times out if the authenticated decline cannot reach it. Server maintenance records missed outcomes and clears SDP.

**Verified:** PWA service-worker VM action/cancellation tests, native payload tests, and real PostgreSQL offline missed-call cleanup. New Android calling classes have NOT been confirmed by an APK build/device run. CI includes Android compilation/JVM tests with a synthetic Firebase fixture, which cannot test FCM.

**Limitations/security/readiness:** no microphone or key material goes through push. Opaque high-priority FCM is retained; Android delivery depends on permissions, channel settings, valid matching Firebase configuration, OS/battery policy and network. Existing local Firebase configuration does not match the current application ID and is not replaced with production credentials. No full-screen permission or eligibility claim, native foreground calling service, force-stop guarantee or verified background audio is included. STUN-only WebRTC can fail on networks needing TURN. PWA wake-up cannot guarantee background WebRTC execution. Physical Android/PWA foreground, hidden, locked, closed, decline, timeout and reconnect tests are release blockers for calling claims.

### Scheduled messages

**Original problem/root cause:** processing selected a due row before locking and could use stale text/time after an edit; edit UX was absent, timestamps without offsets were accepted. Server settings can deliberately disable scheduling.

**Changes/files:** `src/server/scheduled-messages.ts`, scheduled API, `src/lib/scheduled-time.ts`, `scheduled-message-manager.tsx`, chat view. Claim/edit/send use the same locked job. Current membership, restrictions, suspension, slow mode and reply availability are rechecked at delivery. Ineligible jobs are excluded before the batch limit; blocked group peers follow normal group semantics. Message insertion and sent marker commit atomically. Sent queue ciphertext is cleared. Edit/cancel controls re-encrypt on-device and synchronize through personal events. Explicit offset/Z timestamps are required; UI uses local time and labels the timezone.

**Verified:** plaintext refusal, edit before send, unauthorized edit refusal, cancellation, concurrent workers, and a separately restarted Node worker reuse the same persisted sent marker. Integration runs with no sender/recipient browser connected. Unit timezone tests cover offsets/UTC and missing-zone rejection.

**Limitations/security/readiness:** stored text remains ciphertext. Delivery is polled, nominally every ten seconds, rather than a guaranteed exact wall-clock instant. An awake server or configured worker is required; `STARTER_MODE=1` requires `SCHEDULED_MESSAGES_ENABLED=1`. Committed message insertion is deduplicated; this is not a guarantee that an external push provider delivers exactly once. Chromium verified decrypt/edit/cancel controls against the development and optimized production servers; remote CI remains pending. No database migration is needed specifically for schedule editing.

### Disappearing messages

**Original problem/root cause:** read-side soft deletion retained ciphertext, alternate read surfaces could expose expired content, and offline cleanup depended on limited maintenance. Decrypted blobs/caches could outlive messages.

**Changes/files:** `src/server/message-lifetime.ts`, `src/server/chat.ts`, media/export/push-delivery routes, realtime/maintenance, chat view/layout, attachment components/E2EE context, `use-e2ee.ts`, `use-expired-at.ts`, message cache and types. Deadlines deny reads independently of cleanup. Search, replies, starred/pinned previews, files/gallery, exports and notifications honor expiry. Independent five-second maintenance erases ciphertext in bounded batches, scrubs replay events/notification data and emits metadata-only expiry events. Clients use nearest-deadline timers and resume checks, remove cached plaintext, revoke decrypted blob URLs/audio caches and stop caching timed plaintext. Attachment access is denied after expiry.

**Verified:** real PostgreSQL read redaction before cleanup, search exclusion, offline ciphertext erasure; expiration boundary unit tests. Migration index supports bounded expiry sweeps. Actual media playback/download expiry and multi-device UI are not yet browser/device verified.

**Limitations/security/readiness:** server access ends at the authoritative deadline; cleanup can lag under backlog or server downtime. Media binaries follow the existing deleted-message retention cleanup (up to 24 hours), with access already denied. Previously saved external files/OS notification history cannot be recalled. Cleanup is destructive; the migration/retention rollout requires approval. Physical media/background tests are release blockers; the text expiry browser workflows passed.

### Individual Self-Destruct Message

**Original problem/root cause:** this was a missing feature, independent of conversation disappearing settings.

**Changes/files:** migration `0053_message_lifetime.sql`, schema, expiration helper/types/schemas, message creation/reveal API, lifetime service, chat UI, outbox/cache and the read surfaces above. Text-only composer option sends an encrypted message hidden from recipients until explicit Reveal. First recipient reveal atomically establishes one global five-second deadline; database constraints enforce the fixed interval. A countdown appears and expiry replaces content with a minimal placeholder. Refresh cannot reset it. Contents are excluded from search, replies, forwards, exports, notification previews and persistent decrypted caches. Self-destruct drafts/retries are memory-only and clearly labeled. Expiry erases stored ciphertext; no self-destruct attachments are accepted.

**Verified:** simultaneous recipient reveals share one immutable deadline exactly 5,000 ms later; sender/nonmember reveal denied; chat-level disappearance does not prestart this timer; subsequent reveal cannot reset it; expired reads denied and ciphertext erased; database rejects six-second duration; unit boundary tests. Chromium verified explicit reveal, visible plaintext, expiry after reload, unchanged persisted deadline after reopening, and export exclusion.

**Limitations/security/readiness:** countdown rendering cannot be guaranteed at an exact millisecond in a frozen OS/browser process; access checks still enforce the stored deadline on the server and resumed clients. There is one shared deadline across recipients, not five seconds per group member. Secure client deletion is best effort; screenshots, recordings, external copies and malicious clients cannot be prevented. No such prevention is claimed. Requires approved migration, production-bundle CI and physical-device verification before enabling in production.

### Encryption recovery

**Original problem/root cause:** the encrypted identity backup relied on a random secret stored alongside it in localStorage. Clearing storage could destroy the only wrapping secret. File export/trusted device enrollment required advance action; registration failures could be hidden. The active hosted Android WebView is not evidence of hardware-backed key recovery.

**Changes/files:** `src/lib/cloud-key-recovery.ts`, `src/server/recovery-backups.ts`, recovery API, `cloud-recovery.tsx`, application layout/profile integration, `use-e2ee.ts`, schema and `0054_encrypted_recovery_backups.sql`. Opt-in cloud snapshots contain only client-encrypted recovery bundles. A random 256-bit user-controlled code feeds domain-separated HKDF-SHA-256 and AES-GCM, binding account/device/backup identity. Setup requires saving and re-entering the code; no file export is required. Settings show status/backup timestamp, missing-recovery warnings, restore and refresh. Key-change refresh runs outside the messaging path. Revisions prevent stale overwrite, and trusted live device sessions authorize writes. Restore validates the original registered identity and requires explicit confirmation before replacing local active keys. Existing keys are never silently regenerated or migrated. Table RLS blocks direct public/client-role access; server routes enforce ownership. Account switch/unmount cancels registration/backup work before local secret writes.

**Verified:** crypto tests restore the original identity and reject wrong code, weak password input, tampering and cross-account/device/backup substitution. Real PostgreSQL tests reject untrusted/revoked sessions, cross-owner reads and stale revisions; direct RLS reads/writes are denied to a grant-only role. Additive SQL applied on disposable databases. Chromium verified setup, browser localStorage loss, restoration using the saved code and decryption of the original history.

**Limitations/security/readiness:** users must establish a recovery factor before losing devices. Accounts with no saved code, usable trusted device or valid encrypted export cannot recover historical keys through email/Google login. Recovery cannot create missing historical conversation keys that no snapshot/device possessed. Codes retained on a device for automatic refresh share the application's existing XSS/device compromise threat; keep an independent copy outside Circlo. This is not an automatic Google/OS escrow or hardware-keystore implementation, and it does not back up Signal ratchet sessions. Review cryptography, restore UX and migration policy; CI/browser/device validation and production migration approval remain required.

## Additional regression found during browser validation

A read/history update could cancel a message-decryption effect while its WebCrypto batch held the message ID. The replacement effect skipped the in-flight ID, and the cancelled batch discarded its result without waking another pass. This left a permanent loading bubble despite successful sidebar decryption. `chat-view.tsx` now wakes decryption after an interrupted batch releases its IDs, guarded against unmount and conversation changes. Chromium then displayed the real message in the recipient conversation. Existing participant-device verification remains intact; the test explicitly compares fixture fingerprints and approves through the UI.

Browser validation also found two new files encoded as Windows-1252; both were converted to UTF-8. Test requests now use the actual PATCH method for settings and message assertions target the conversation region rather than hidden sidebar previews.

## Verification and release gate

- Dependencies installed in the isolated checkout; no new dependency or paid service introduced.
- Real PostgreSQL: eight integration tests passed, including worker-process restart, concurrent permission/ownership changes, fixed expiry, offline cleanup and recovery RLS/authorization. Three additive migrations also applied successfully through the full migration chain to a separate empty disposable database.
- Final local verification: 100/100 unit tests passed, 8/8 PostgreSQL integration tests passed, repository-wide ESLint passed with zero warnings, TypeScript `tsc --noEmit` passed, optimized `npm run build` passed, production-bundle Chromium workflows passed, and `git diff --check` passed. These checks ran sequentially to avoid host memory exhaustion. The final schedule integration includes blocked-peer group delivery.
- Browser runner: two actual encrypted fixture accounts, group permissions/live policy, normal decrypt, reveal/reload/export, schedule editing/cancellation, recovery setup/data-clear/restore. Early Chromium attempts exited before navigation on the constrained host. A later retry with available memory and an explicitly bound loopback development server verified group permissions/synchronization, fingerprint approval, normal recipient decryption, self-destruct reveal/reload and export exclusion. The final full suite passed: group permissions/live synchronization, actual fingerprint comparison/approval, normal E2EE messaging, self-destruct reveal/reload/export exclusion, scheduled-message decrypt/edit/cancel, and recovery setup/storage loss/original-history restoration. The full suite subsequently passed again against the optimized standalone production bundle. These are local desktop Chromium runs; they do not establish physical PWA/native background behavior.
- Next development startup exposed an instrumentation runtime guard that imported Node maintenance into Edge compilation; fixed using the installed Next documentation's explicit Node runtime branch.
- Added `.github/workflows/reliability.yml` for Node 22/PostgreSQL, production-bundle browser tests and Android compilation/JVM checks. Remote CI has not run. Local Node is 24, whereas the supported CI runtime is 22.
- Physical device: no connected Android device. Android/PWA hidden, closed, locked and ongoing-call scenarios remain unverified. No force-stop claim.
- Host limitations: initial attempts encountered a full C: drive and scarce virtual memory; a later browser retry succeeded when resources were available. Logs and test database stayed on D:. No production database, original dirty checkout, existing notification patch or production encryption data was modified. Work remains on the isolated `codex/reliability-security-audit` branch and is not deployed.

Required before release: all CI jobs green, physical Android/PWA matrix, matching production Firebase app configuration, security review, approved SQL/retention migration and rollback plan, explicit deployment approval. Until those gates pass, no feature is represented as fully verified or deployment-ready.

Local verification logs (outside the repository): `D:/downloads/circlo-notification-verification/audit-unit.txt`, `audit-integration-results.txt`, `audit-lint.txt`, `audit-typecheck.txt`, `audit-build.txt`, `audit-browser-results.txt`, and `audit-production-browser-results.txt`. No physical-device or remote-CI pass is implied by these logs.
