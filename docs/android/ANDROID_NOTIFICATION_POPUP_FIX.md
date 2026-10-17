# Android notification pop-up fix — debug handoff

16 October 2026, Asia/Dubai. **Implemented locally; not deployed or physically verified by the agent.** No production configuration, migration, Play publication or push occurred. Existing upload-signed APK/AAB and signing identity are unchanged.

## Findings and implementation

The inspected release source already used `maddychats-messages`, named Messages, with IMPORTANCE_HIGH. It did **not** prove the user's installed General channel was HIGH: the tested package/build/channel ID and phone settings have not been inspected through ADB. A General label may belong to a legacy/SDK fallback channel or OEM UI. The owner's physical observation proves a saved OS pop-up setting matters; no claim that our previous importance constant alone caused it.

Verified source defects/gaps:

- MainActivity created channels only when opening the activity; a cold background service had no equivalent setup. New `CircloApplication.onCreate`, service.onCreate and the activity share `NotificationChannels.ensure`. The channel exists before background SDK handling; startup never requests notification permission.
- `.setOnlyAlertOnce(true)` silenced alerting updates to an existing per-chat notification. It is now false for distinct alerting events; the existing recipient/expiry/foreground/dedup gate stays in place.
- Unconditional builder vibration conflicted with silent delivery. Per-notification audible/vibration defaults now apply only before Android8 and only to non-silent activity; channel behavior controls Android8+.
- No native system-settings action/status was available. Exact-origin, main-frame bridge now supports only fixed `status`/`settings` commands. Profile Notifications has a wrapped mobile-friendly button and explains blocked/quiet state. Returning to the page refreshes status; no automatic permission prompt or permission loop.

Central configuration:

| Purpose | ID / configuration |
|---|---|
| Alerting Messages | **Existing** `maddychats-messages`; first-creation IMPORTANCE_HIGH, default notification sound/vibration, private visibility; CATEGORY_MESSAGE and PRIORITY_HIGH for legacy compatibility. |
| Non-interrupting activity | New `circlo-quiet-activity`, named Quiet activity, first-creation IMPORTANCE_LOW, no sound/vibration; PRIORITY_LOW, silent builder. Used only for already-silent updates, never to restore heads-up. |
| Saved settings | Existing channels are not deleted/recreated/raised; ensure skips channels already present. A blocked Messages channel also blocks the quiet route, so the new quiet category cannot bypass that decision. User-disabled quiet channel is respected too. |
| Content/delivery | Native notifications show the sender and a bounded message preview for messages the server stores as readable text. End-to-end encrypted messages keep a generic preview; keys and ciphertext are never included. Android notifications remain private on the lock screen, subject to the user's OS settings. Data-only native delivery and event/account/expiry checks remain. Foreground app stays quiet; background eligible events share a replaceable per-chat notification. |

Server `src/server/notifications.ts` already excludes muted/archived conversations and respects notification preferences. That behavior remains unchanged; no deliberate alert is sent for a new muted-conversation message. Sound-disabled eligible updates can use quiet activity. Backend transport `priority=high` is distinct from channel importance and does not itself guarantee a banner.

## Android owns the final behavior

Android13+ still needs POST_NOTIFICATIONS permission, requested only by the user's Enable action. Android8+ owns persisted channel importance/sound/vibration; Circlo can choose initial defaults and request eligible notifications, not silently undo the user's choices. DND, device lock state, OS alert cooldown, battery restrictions and manufacturer Pop-up/Floating controls can prevent heads-up. HIGH importance is eligibility, not a guarantee. Standard APIs do not expose every OEM pop-up switch; status UI does not claim it can detect them.

The button opens the Messages channel page when app notifications are enabled, app-notification settings when globally blocked, or app details on older Android/fallback. No full-screen intent, overlay, DND-access or extra permission added. No channel-ID rotation/migration to bypass saved preferences. The only added category reduces interruptions for silent updates; Messages retains its permanent ID.

Official reference: https://developer.android.com/develop/ui/views/notifications/channels .

## Artifact and executed checks

Debug APK outside Git:
`C:\Users\mudas\CircloRelease\artifacts\circlo-0.9.4-13-notification-debug-20261016.apk`

SHA256 `7a9d843d090d5fdca12ca813be31a3c14213c8d4c51eff1f5cfbf1c04220808f`.
Package chat.circlo.app,0.9.4(13),target36,debuggable=true, Android debug certificate (not upload/Play signer). Apksigner verification PASS; binary manifest confirms new Application/default channel and unchanged permission set. Native guard/classes/quiet-channel identifier checked in DEX. Full evidence: NOTIFICATION_DEBUG_BUILD_EVIDENCE.json.

- PASS73web unit tests including concurrent bridge status/token/settings replies.
- PASS ESLint, TypeScript and production web build.
- PASS local item3 integration: auth/session/native token lifecycle plus360px quiet-channel explanation and settings command button without triggering Android permission; existing deletion, reporting and media authorization regressions also pass. Simulated port, no real OS settings/FCM delivery.
- PASS Android4JVM tests; debug APK and instrumentation APK compiled offline. Two new instrumentation tests compile; **not executed** because ADB lists no device and emulator is not installed.
- PASS Android lint0errors/44warnings.42existing warning categories plus2new UseKtx style suggestions for Uri.parse; no suppression. Test-only legacy priority/sound/vibration assertions emit deprecation warnings because they verify pre26 compatibility. Existing Gradle deprecations remain.

Reproduce native build: set existing JAVA_HOME/ANDROID_HOME; from android run `gradlew.bat testDebugUnitTest assembleDebug assembleDebugAndroidTest lintDebug --offline --no-daemon --max-workers=2`. On an explicitly designated test phone, `gradlew.bat connectedDebugAndroidTest` executes the two platform tests; they never delete/reset channels.

## Physical-device checklist — all pending

Use a spare device/Android profile with fake accounts. Debug signing differs from the existing upload-signed install: do not uninstall/clear a trusted real installation to work around INSTALL_FAILED_UPDATE_INCOMPATIBLE. Preserve its trusted key/recovery backup. Native Google sign-in may require the debug certificate registered separately in the authorized OAuth project; this was not changed here.

Record phone/OEM/Android version, exact package/version/APK checksum, app permission, channel ID/name/importance, sound/popup state, DND, network and expected/actual result. Avoid shared raw logs/private notifications.

1. Fresh install: deny Android13permission; no OS notification or repeated prompt. Use Enable, grant permission; Messages initially HIGH, no unexplained required channel-migration step. First installation's OEM behavior still needs measurement.
2. Keep app foreground, send from a second fake account: message appears normally, no OS duplicate/banner. Background with Home: one eligible generic notification. Open tap: correct chat/message with normal authentication/membership gates.
3. Swipe activity away, then test OS cold process: FCM notification and correct cold tap. Force-stop separately: Android normally blocks delivery until reopening; do not confuse this with swiping away.
4. Send another distinct event to a chat with a visible existing notification: notification updates and can alert; replay the same fixture event: no duplicate. Android may rate-limit repeated banners, which Circlo must not bypass.
5. Mute direct/group conversation, send new messages: no pop-up/sound/vibration. Disable notification sound with eligible unmuted activity: it uses the quiet channel and preserves the sender/preview without sound or vibration.
6. Disable Messages in Android, leave quiet updates enabled in app: no quiet-channel bypass. Disable all app notifications: status explains blocking and button opens app notification settings. Restore only through explicit user action.
7. Lower existing Messages importance, restart/upgrade APK: saved level/sound/vibration remain unchanged. Status explains quiet/blocked state and opens that channel. Do not reset channels, clear storage or reinstall as a fix.
8. Set Messages HIGH but disable OEM Pop-up/Floating option: UI gives accurate guidance, never says banners are definitely enabled. Use its settings button; re-enable manually and retest. Repeat with DND on/off and locked/unlocked screen; lock screen never reveals actual message content.
9. Revoke permission, log out, switch account: no old-account notification. Confirm existing expiry/dedup checks and permission refusal still hold. Check offline reconnect and media/mic unaffected.
10. Run the two instrumentation tests on the designated device and record outcomes. Actual FCM foreground/background/closed tests are separate from compilation and simulated bridge tests.

## Deployment dependency — no live success claimed

This is a hosted WebView app: the APK contains native channel/startup/settings support, while the new profile button/text comes from the **web source** and requires a separately authorized deployment. A debug APK alone cannot update circlo.chat's hosted Settings UI. Current production still lacks the coordinated session-bound data-only backend/configuration previously prepared; real delivery acceptance requires that compatible backend. Legacy automatic FCM notification payloads can use Android SDK presentation rather than our data-only builder. Do not claim quiet-routing/account-gate behavior for that old protocol.

No production change is part of this task. Previous pinned rollout approval scope excludes these newer changes and would need review/repinning if they are included. This debug APK is for testing, not Play upload; the old signed release candidate is not silently replaced.
