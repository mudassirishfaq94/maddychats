# Circlo — final release compliance checklist

16 October 2026. **HOLD — do not submit yet.** This is the final checklist for the approved new listing, not a claim that every item passes. No Play upload, publication, Firebase change or production deployment is authorized by signing the build.

Identity: `chat.circlo.app`; existing hosted WebView implementation retained with Java namespace `app.ziptalks.android`. Candidate versionCode13/versionName0.9.4. Owner explicitly approved this new package and a new upload key. The old debug APK/package remains a separate installation; preserve it until secure linking/recovery has been completed. Never uninstall/clear its encryption storage as an upgrade shortcut.

PASS means the stated evidence exists. FAIL means an observed unmet condition. BLOCKED requires owner/external action. NOT VERIFIED requires acceptance evidence. A signed AAB alone is not a compliant or approved app.

## Release engineering gates

| Gate | Current status / evidence | Required closure |
|---|---|---|
| Permanent package | PASS owner approval: `chat.circlo.app`, new listing | Confirm exact package in new Console listing before upload; never reuse the old package accidentally |
| Version | Candidate13/0.9.4; greater than old source12 | Confirm no equal/higher upload exists for the new listing; increment for every later upload |
| Permanent upload key | PASS created RSA3072 outside Git; owner/SYSTEM-only directory ACL, DPAPI-encrypted password | Owner saves password in a password manager and verifies two encrypted offline backups; current Windows-bound DPAPI file alone is not a portable recovery backup |
| AAB signing/verification | PASS signed AAB and APK prepared; approved signer and new-package manifests verified | Require real JAR signature, approved signer fingerprint, bundletool validation, package/version, nondebuggable release and checksum evidence; never rely solely on command exit0 |
| Play App Signing | BLOCKED Console action not performed | Enroll/verify the Play app-signing key, record its public SHA256/SHA1 separately from upload/debug certs |
| API36 /16KiB / permissions | PASS final signed candidate static checks: target36, nondebuggable, no broad permissions,16KiB alignment; physical/split testing NOT VERIFIED | Final target36+, no broad media/storage/camera/boot/full-screen permissions, native16KiB alignment, physical/split acceptance |
| Build artifacts/secrets | PASS repository exclusion and external signing design | No keys/passwords/service accounts/APK/AAB in Git; inspect staged changes and scan history before any later authorized push |

Public upload certificate fingerprints are in `release-signing-record.json`. These are not private keys. Use the actual **Play app-signing certificate** for Play-installed app links/OAuth where required; the upload certificate is not automatically its substitute.

## Firebase, auth and native acceptance

| Gate | Status / actual evidence | Required closure |
|---|---|---|
| Existing Firebase project identified | PASS local Android configs and backend `.env` project-ID setting both select `ziptalks-5b402` (Zip Talks), not the other project | Actual production secret configuration remains NOT VERIFIED; compare project identity without exposing credentials |
| New-package Firebase Android app | PASS supplied file verified: project `ziptalks-5b402`, matching client `chat.circlo.app`; Android OAuth client not listed | Configuration copied locally and ignored by Git; retain old Firebase registration. No Firebase project/billing change performed by the agent |
| Google authentication cert/package | BLOCKED new package/cert acceptance untested | Register the upload-signed test package/cert and later Play app-signing cert in the appropriate Firebase/Google OAuth configuration; test real Credential Manager consent/cancel/MFA/enrollment |
| Backend notification protocol | BLOCKED deployment not approved/performed | Deploy reviewed Phase3 frontend/backend and migration0049 together after approval, verify server Firebase project/service-account configuration; do not test/distribute against legacy auto-notification protocol as though compatible |
| Android notifications | PASS code/unit/local HTTP/simulated-port tests; NOT VERIFIED real FCM/phone | Test permission allow/deny/permanent denial, foreground quiet, background/closed activity, click-to-chat/call, duplicate suppression, preferences/sound, two devices, logout/account switch and token refresh with expired session/offline |
| Core app/session/encryption | PASS prior local regressions and owner-reported informal old-APK messaging | Run new signed-package phone matrix, preserving E2EE and trust gates; test process restart, account switching, device linking/recovery, groups/media/mic, typing and reconnect. No plaintext fallback |
| Native offline/back/performance | NOT VERIFIED physically | Confirm native offline Retry, keyboard/back/overlays, large fonts/rotation/low-memory resume and same-device latency before/after. PWA worker tests do not certify native WebView offline UX |
| Signature transition | Known new installation, not an in-place old-debug update | Keep trusted original available; link new app as a new device or use verified recovery backup. Email recovery cannot reconstruct lost old message keys |

Use `PHASE_3_DEVICE_AND_CLOSED_TEST_CHECKLIST.md` to record actual device/Android/WebView/build-hash/results. Informal APK tests by friends are not Play closed testing. The agent has no connected phone and has not claimed physical acceptance.

## Public policy and account lifecycle

Read-only public HTTPS checks in this task:

| URL | Observed result | Compliance decision |
|---|---|---|
| `https://circlo.chat/` |200 HTML | PASS accessibility only |
| `https://circlo.chat/privacy` |200 HTML | PASS accessibility; owner accuracy/processor/retention/contact review still needed |
| `https://circlo.chat/terms` |200 HTML | PASS accessibility; owner acceptable-use/age/legal review still needed |
| `https://circlo.chat/support` |404 | FAIL intended support destination; approved local page exists, requires approved deployment |
| `https://circlo.chat/delete-account` |404 | FAIL intended external deletion destination; approved local page exists, requires approved deployment |
| `https://circlo.chat/.well-known/assetlinks.json` |404 | FAIL verified-app-link association; obtain actual Play signer before publishing trust. This WebView is not TWA; do not claim full TWA verification is required for basic WebView launch |
| `https://circlo.chat/manifest.webmanifest` |200 manifest JSON | PASS accessibility only |

- [ ] **BLOCKED:** owner confirms a monitored public support/deletion email and developer/legal identity. Do not invent a mailbox or infer a private admin address. Provide the actual contact consistently in Console and public policy.
- [ ] **BLOCKED:** deploy and recheck public support/deletion resources and all policy navigation without requiring app installation. Don't submit a404 deletion URL.
- [ ] **PASS local / NOT VERIFIED production:** fresh-auth/CSRF/explicit-confirm deletion, both cookies expired, identity/session/message cascades, shared-recipient media preservation and aged owned orphan purge passed disposable-data tests. Verify actual scheduled cleanup, historical files, processor backups/security retention and all-device local cache behavior. Do not promise instantaneous deletion of recipients' copies.
- [ ] **BLOCKED:** privacy policy accurately names Circlo, collected data/purposes/processors, sharing/security, retention/deletion, contact and current functionality. Do not market audited Signal/forward secrecy/zero metadata as verified facts.

## Data Safety, UGC and store declarations

- [ ] **BLOCKED:** complete Data Safety against actual deployment and final SDK inventory. Account identifiers/email/optional phone, device/session/push tokens, routing/interaction metadata, diagnostics, reported content and readable profile/group/status media require review. End-to-end unreadable message contents have distinct handling; E2EE does not exempt everything from disclosure. Firebase receives opaque routing/token metadata even when notification text is generic.
- [ ] **BLOCKED:** verify whether phone/contact lookup transfers contact data, user consent and optionality; self-entered country/phone is not proof of identity or verified GPS location. No unverified bulk-contact-sync claim.
- [ ] **PASS local / NOT VERIFIED operations:** report/block UI/API tests pass; validate actual group/status reporting coverage, moderator access, staffed response and escalation. Never decrypt E2EE content silently to facilitate moderation.
- [ ] **BLOCKED where applicable:** published child-safety standards, designated contact, handling/escalation and Console attestations for the chosen category. A13+ text statement is not itself a compliant child-safety operation.
- [ ] **BLOCKED:** IARC rating, target audience/age, actual category/countries, ads declaration and any billing/paid-feature promises reviewed by owner. Do not invent questionnaire answers or select a false category to avoid requirements.
- [ ] **BLOCKED:** reviewer app-access credentials and repeatable instructions in Play Console only, using maintained fake-data accounts. Reviewers need access without waiting for the owner to send expiring codes. No universal code, trusted-device bypass or production-user data. Resolve secure enrollment with Play review guidance if necessary.
- [ ] **BLOCKED:** approved store title/descriptions,512px icon, feature graphic, genuine release phone screenshots with fake data, support/privacy/deletion links. No false competitor affiliation or absolute security/approval claims.
- [ ] **NOT VERIFIED:** Play SDK/runtime policy review, actual data retention/deletion obligations and current Console warnings; signature verification is not an independent security/legal certification.

## Official closed-testing sequence — no upload authorized

1. Close the build/configuration and new-package real-phone acceptance gates above.
2. Verify developer registration/identity and account-type eligibility; owner handles any fee separately.
3. Complete public policy/contact/retention/moderation/reviewer-access and all Console declarations.
4. Authorize upload separately. Inspect the final signed AAB and public signer fingerprint, enroll Play App Signing, create the correct closed track and review pre-launch/crash/ANR results.
5. Choose consenting testers/countries, obtain the actual Console opt-in URL and distribute through the owner. No invitation link can be fabricated before track setup.
6. Record opt-in dates, genuine activity, device/network coverage and feedback/fixes. Where the current new-personal-account rule applies, maintain at least12 continuously opted-in testers for14days; confirm the actual Console requirement for this account.
7. Recheck fixes using higher versionCodes and signers, then apply for production access separately if required. Google Play approval is not guaranteed.

References checked: [app signing](https://developer.android.com/studio/publish/app-signing), [target API](https://developer.android.com/google/play/requirements/target-sdk), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111), [Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469), [UGC](https://support.google.com/googleplay/android-developer/answer/9876937), [reviewer access](https://support.google.com/googleplay/android-developer/answer/15748846), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
