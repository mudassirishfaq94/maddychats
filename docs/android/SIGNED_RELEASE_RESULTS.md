# Circlo signed release candidate —16 October 2026

**Signed artifacts prepared and cryptographically verified. Play submission remains HOLD.** No GitHub push, deployment, Play upload/publication, paid resource or agent-initiated Firebase configuration change occurred. The owner supplied the matching Firebase Android client file.

## Approved identity and implementation

- Owner explicitly approved `chat.circlo.app` for a **new Play listing**, and creation of a new upload key outside Git.
- Candidate versionCode **13**, versionName **0.9.4**; minSDK24, target/compileSDK36. Recheck Console version history before any upload.
- Existing hosted WebView/native-helper implementation reused. Java namespace/classes remain `app.ziptalks.android`; changing applicationId does not require moving/rebuilding that architecture.
- `capacitor.config.ts`, Android applicationId/package resource and approval record agree on the new package. No TWA project generated or active encryption/auth/message implementation rewritten.
- This package is a **separate installation** from the old debug APK. Preserve the trusted original until the new installation is linked or a recovery backup verified. Signing cannot reconstruct or transfer lost encryption keys.

## Prepared files — outside Git

| Artifact | Path | Verification |
|---|---|---|
| Play upload candidate | `%USERPROFILE%\CircloRelease\artifacts\circlo-0.9.4-13-release.aab` | JAR signature valid; exactly matches approved upload certificate; bundletool validation; actual package/version/target/nondebuggable manifest; native16KiB alignment |
| Sideload test candidate | `%USERPROFILE%\CircloRelease\artifacts\circlo-0.9.4-13-release.apk` | APK Signature Schemev2/v3 valid; same upload certificate; package/version/target/nondebuggable;16KiB ZIP/native alignment; compiled Firebase resources match supplied client |
| Private upload keystore | `%USERPROFILE%\CircloRelease\signing\circlo-upload.p12` | New RSA3072 key; existing-file overwrite guard tested; outside every checkout, directory ACL only owner/SYSTEM |
| Encrypted password | `%USERPROFILE%\CircloRelease\signing\upload-password.dpapi` | Windows-user-bound DPAPI; decrypted only in signing-process memory; no plaintext password file or secret value in tool output/Git |
| Public upload certificate | `%USERPROFILE%\CircloRelease\signing\upload-certificate.pem` | Fingerprints in `release-signing-record.json`; public certificate, not a private key |

Exact hashes/sizes and manifest evidence: [signed-release-build-evidence.json](signed-release-build-evidence.json). The original unsigned Gradle output remains unsigned; the external copy was signed. A Gradle task named `signReleaseBundle` was not treated as proof of signing.

The APK is signed with the **upload key**, not a known Play app-signing key. Once Google Play App Signing uses a different certificate, an upload-signed sideloaded APK may not update in place to the Play installation. Prefer the Play-delivered build for official testers. Preserve another trusted device/recovery backup before any deliberate reinstall; do not erase app storage to bypass signature/trust issues.

Self-signed upload certificate warnings are expected for this private upload identity; the actual signature and exact approved certificate were verified. No timestamp authority was contacted. Neither signing nor this warning grants Google Play approval.

## Firebase and Google sign-in

The owner-provided `D:\Downloads\google-services (4).json` was parsed as data, checked against project **`ziptalks-5b402`** (Zip Talks), and confirmed to contain exactly one matching `chat.circlo.app` client. It was copied locally into `android/app/google-services.json`; that deployment-specific file is now ignored and removed from tracking. The original attachment and original checkout were not changed. No server service-account key was copied into the app.

The Gradle configuration now fails explicitly when the matching client is missing; it no longer silently skips Firebase or reuses another package's client. Final APK resource inspection confirms the supplied matching Firebase application/project resources are compiled into the signed artifact.

**NOT VERIFIED:** actual production backend project/service-account settings and real FCM delivery. The supplied file does not list an Android OAuth client. That does not by itself prove the Cloud project lacks one, but real Google sign-in must be tested/registered for the new package and certificate. Public upload SHA1/SHA256 are in the signing record; register the separate Play app-signing cert for Play-delivered installations when available. No Firebase project, billing setting or OAuth registration was changed by the agent.

## Executed verification

| Check | Result |
|---|---|
| Existing Gradle project `testReleaseUnitTest bundleRelease assembleRelease lintRelease --offline --no-daemon --max-workers=2` | PASS, build successful2m54s |
| Android release unit tests | PASS4,0fail:3 origin/push security checks and1 retained template arithmetic test |
| Android release lint | PASS0errors,42warnings; existing reviewed categories retained, no suppression |
| AAB signature and approved-certificate equality | PASS actual JAR verification, public signer extraction and exact certificate comparison |
| Bundletool validation/package/version/target/permissions | PASS target36,13/0.9.4,chat.circlo.app,nondebuggable/HTTPS-only/no broad media-storage-camera-full-screen permission |
| Signed APK signature/alignment/resources | PASSv2/v3, approved certificate,16KiB ZIP/ELF, matching compiled Firebase resources |
| Verification negative cases | PASS unsigned AAB and wrong version rejected without writing success evidence |
| Signing-tool guards | PASS PowerShell/Python syntax; attempt to recreate existing upload key rejected and key hash unchanged; both tools reject repository-contained key/signed-output paths without creating files |
| Root unit regression suite | PASS72tests,0fail |
| Optional TWA config tests | PASS2; no optional Bubblewrap CLI initialization/build/signing |
| Root ESLint | PASS |
| Phone/install/real Google/FCM/Play splits | NOT VERIFIED; no connected authorized phone or emulator execution |

Reproduce signed-AAB inspection (no private key required), after setting the existing approved JDK in `JAVA_HOME`:

```powershell
python scripts/verify-signed-android-release.py --aab "$env:USERPROFILE\CircloRelease\artifacts\circlo-0.9.4-13-release.aab" --certificate "$env:USERPROFILE\CircloRelease\signing\upload-certificate.pem" --bundletool .freebuff/android-tools/bundletool-all-1.18.3.jar --output .freebuff/reverified-signed-release.json
```

`scripts/new-android-upload-key.ps1` refuses existing material and repository-contained paths. `scripts/sign-android-release.ps1` validates the pinned bundletool, approved package/version, absence of debug/already-signed input and outside-Git/nonexisting output before signing. It reads only the local DPAPI-encrypted password and clears its temporary environment variable afterward. No password argument value, permanent Gradle signing secret or server credential is committed. New releases require an explicit version update/review rather than silently overwriting this candidate.

## Required owner backup action

**BLOCKED — portable recovery backup not verified.** Preserve the complete signing folder now. The keystore is password-encrypted, but the DPAPI password file only decrypts under the current Windows user/profile; copying that file to another computer is not a portable password backup.

In a private local session, transfer the recovered password directly into your password manager without putting it in this chat, screenshots or shared logs. Make two encrypted offline copies of the keystore in separate owner-controlled locations and verify a restored copy with `keytool -list` using the saved password. Never replace the upload key just because a password/backup was lost; follow Play's upload-key recovery process if needed.

If the owner needs to recover the generated password locally, this command is for an **owner-run private PowerShell console only**, not an assistant tool call or shared/logged session:

```powershell
$secure = Get-Content "$env:USERPROFILE\CircloRelease\signing\upload-password.dpapi" -Raw | ConvertTo-SecureString
$credential = [PSCredential]::new('circlo-upload', $secure)
$credential.GetNetworkCredential().Password
```

The actual password was never printed by the agent. Securely store it before migrating/reinstalling Windows. Play's app-signing key will be separate unless explicitly configured otherwise.

## Submission status and remaining gates

Use [FINAL_PLAY_COMPLIANCE_CHECKLIST.md](FINAL_PLAY_COMPLIANCE_CHECKLIST.md) as the current checklist; Phase2/3 unsigned-build reports are historical snapshots and their build-output files may since have been replaced.

**HOLD:** live `/support` and `/delete-account`404; monitored public contact/retention/moderation/Data Safety/reviewer access still need owner/operational acceptance; coordinated Phase3 web/backend migration/deployment not approved; new-package real Google/FCM, native offline/back/session/encryption acceptance and Play-delivered16KiB/device tests not run; portable key backup and Play App Signing not completed. Do not upload this candidate until these gates and separate submission approval are satisfied. No guarantee of Google Play approval is made.
