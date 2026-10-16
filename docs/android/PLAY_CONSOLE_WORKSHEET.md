# Circlo closed-testing preparation worksheet

Draft only. Do not submit inaccurate declarations or invent working support contacts, moderation staffing, reviewer access or successful tests.

## Store materials

- Suggested title: **Circlo — Private Messenger**. Verify current Console character limits before submission.
- Suggested short description: **Private conversations, encrypted chats, groups and voice messages.**
- Draft description: Circlo is a messaging app for staying close to your people. Send end-to-end encrypted chat messages and attachments, create groups and share voice notes. New devices use secure linking or account recovery. Privacy settings let you control discovery and interaction. Status updates, account/profile information and delivery metadata are handled separately from encrypted chat contents. Calls depend on network conditions. Do not promise audited Signal protocol, anonymous metadata, universal background calling or unreleased paid features.
- Website `https://circlo.chat`; privacy `https://circlo.chat/privacy`; support `/support`; deletion `/delete-account`. The last two pages are **local changes, not deployed**. Test their public HTTPS responses after an approved deployment.
- Use the approved512px Circlo mark for store artwork. Prepare actual phone screenshots of sign-in, chats, groups, profile privacy and voice/media UI from the tested release, with fake data. Capture feature graphic and other required artwork to current Console specifications. Never show real conversations, personal phone numbers or credentials.
- Developer legal identity, countries, category, support email and public contact require owner confirmation. Do not use a fabricated `support@` address. `PUBLIC_SUPPORT_EMAIL` is an explicit runtime setting for the new support/deletion pages, intentionally public, not a secret.

## Data Safety draft inventory

Use [Google's Data Safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-GB), actual provider behavior and current schema. Collection, sharing, purpose, optionality, retention and deletion are separate questions.

| Data category to assess | Actual handling to verify | Draft purpose / required evidence |
|---|---|---|
| Personal info: name, username, email, optional phone, bio | Account/profile DB; self-entered phone is not verified ownership | Account management and discovery. Record required/optional fields and visibility. |
| Device IDs/tokens, IP, browser/device/country | Sessions, security history, push subscription; native Firebase may initialize/install an identifier before app-level subscription | Security and notification delivery. **Do not mark all identifiers optional** until FCM auto-initialization and SDK behavior have been traced. |
| Messages/photos/videos/audio/files in chats | Client ciphertext, wrapping keys/envelopes, recipient device decryption | Validate all paths before using the narrow unreadable-E2EE exclusion. Account metadata and submitted reports remain separate. No encryption bypass to support moderation. |
| Readable status/profile/group content | Status text/media, avatars, group names/descriptions/membership | User content and app activity; not covered by chat encryption claims. |
| Contact lookup | Optional saved contacts/phone lookup paths | Establish exactly what leaves the device, consent and optionality. Do not claim full-device contact synchronization was verified. |
| Diagnostics/app activity/security logs | Login attempts, timing, read/delivery and interactions; limited moderation audit records | Verify actual retention, processor logs and backups; no blanket no-logging claim. |
| Reports | User-selected reason/description and IDs, not silently extracted plaintext chats | Abuse prevention; explicit user disclosure and appropriate restricted moderator access. |
| Authentication/mail/push/storage processors | Custom auth, Google OAuth, Resend, Neon/Postgres, private Supabase storage, Render, Firebase/native or browser push as actually used | Verify deployment regions, processor roles, contracts and deletion handling. Their presence is not automatic proof of sharing or non-sharing. |

Root and native SDK inventories differ from the optional TWA tooling. Declare the SDKs actually present in the final artifact. A debug APK's successful install is not a completed Data Safety form.

## Deletion, support and moderation gates

- Browser self-service deletion page links to existing authenticated account deletion, with email recovery for a lost device. Ownership verification remains required. Public mailbox fallback appears only after an owner supplies a monitored address.
- Disposable local testing verified SQL cascades, invalidated sessions, owned orphan media removal and shared-file preservation. Provider backups, production cleanup scheduling, historical/untracked objects and all-device local cache removal are **NOT VERIFIED**. Do not claim instantaneous erasure.
- Existing reports support user/message targets; group participants can report messages/authors. Dedicated group/status-content report targets and staffed response need additional scope validation. Blocking direct messages/calls does not remove shared group membership.
- Current reporting UI no longer hides block failures. A report is saved once; block retry does not resubmit it. Moderator staffing, escalation, retention and operational response are owner responsibilities.
- If declaring Social or another category within [child-safety policy scope](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en-EN), provide published CSAE standards, in-app feedback, a real response process and a designated contact. A13+ statement alone is insufficient. Do not select a false category to evade policy.

## Rating, audience and review access

- Answer IARC with actual UGC, user interaction, media sharing, discovery and report/block functionality. Do not guess a rating or claim a self-declared age limit is an enforced age gate. Resolve intended audience/countries with the owner.
- Supply English app-access instructions and maintained fake-data accounts through **Play Console only**, never Git. Reviewers need repeatable access regardless of location or expired OTP. Current MFA/device-link/email codes expire: a reusable secure review arrangement has **not** been verified. Resolve with Play review guidance; never add a master code or disable trust/encryption globally.
- Include exact steps for policies, sign-in, device access, chat with a second fake user, group settings, microphone and attachments, privacy controls, report/block, recovery and deletion. Reviewers must not depend on the developer being online to issue a new six-digit code.
- Verify Google OAuth Android package/certificate registration for the final signed build. Native Google credential success and device recovery require real-device tests; mocked web OAuth does not prove them.

## Closed-test and feedback plan

Friends' sideloaded APK testing is valuable **informal user testing**; it does not start Play's closed-testing timer. Record artifact SHA/version, Android version, network, feature exercised, expected/actual result and whether the issue reproduces. Use fake accounts; remove secrets from screenshots/logcat.

After separate authorization and a signed uploadable AAB: create a closed test, add consented testers, provide the opt-in link and release notes, and collect feedback through a monitored channel. For applicable new personal accounts, [Google requires12 continuously opted-in testers for14 days](https://support.google.com/googleplay/android-developer/answer/14151465). Check account type/creation date and current Console requirements. Plan2–3 network/device test combinations, recovery drills and notification/background cases; do not buy fake tester activity.

Before applying for production access: summarize genuine test engagement, reported defects, fixes, outstanding limitations, release acceptance evidence and operational support. Do not invent engagement or guarantee approval.

## Before paying for Play Console

1. Confirm final package/signing strategy and whether an existing listing exists; preserve upgrade continuity.
2. Verify the rebuilt existing Android experience on phones, including Google login, typing, notifications, media/microphone, recovery and session persistence.
3. Resolve public monitored support/deletion contact, privacy accuracy, retention/moderation/child-safety responsibilities and secure reviewer access.
4. Review the compiled release AAB/permissions/SDK/native libraries; final signing still requires approval. Debug APKs are not Play releases.
5. Authorize and verify the web deployment and real DAL association only when needed for the chosen shell/app links. Do not publish debug trust by default.
6. Prepare honest artwork, declarations and a real tester plan; then decide whether to purchase/register the developer account. No purchase/upload is done by this task.
