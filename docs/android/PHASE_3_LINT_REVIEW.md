# Android lint review — Phase 3

Final existing-project `:app:lintDebug`: **PASS —0 errors,42 warnings**. Release vital lint also passed during bundle generation. Baseline was40 warnings. The obsolete Android-M PendingIntent check was removed because minSDK24 already guarantees that API. New native state handling adds three `UseKtx` style suggestions; net change+2. No baseline, blanket suppression or lint disable was added.

`phase3-lint-inventory.json` lists every current warning, relative code location, line and original message. This table classifies all baseline categories and all new instances. Compiler/Gradle deprecations are separate from lint counts.

| ID | Baseline → current | Risk/relevance and decision |
|---|---:|---|
| SetJavaScriptEnabled |2 →2 | Security review required. Hosted Next app needs JavaScript; disabling it breaks authentication and E2EE. Retained deliberately, with canonical HTTPS navigation, mixed-content prohibition, file access disabled, web CSP, and the new exact-origin/main-frame message boundary. No unsafe `addJavascriptInterface` was introduced. This does not prove immunity to XSS. |
| ObsoleteSdkInt |2 →1 | One unnecessary SDK23 permission flag branch fixed. Remaining drawable-v24 folder qualification is valid but redundant at min24; no security/Play blocker. Resource merging/visual changes deferred to preserve existing launcher assets. |
| UnusedResources |10 →10 | Resource/build-size maintenance; no sensitive permission or exported component implied. Retain existing theme/icon compatibility assets until visual/OEM acceptance. Do not delete source solely to reduce a count. |
| IconLauncherShape |10 →10 | Legacy-density launcher shape guidance; adaptive icons remain. Presentation risk, not a demonstrated install/submission failure. Verify actual launcher masks on the phone; no unreviewed branding change. |
| MonochromeLauncherIcon |2 →2 | Android13 themed-icon support missing. Optional launcher enhancement; not a runtime permission/security defect. Final themed icon needs visual acceptance. |
| IconDipSize |3 →3 | Legacy-density intrinsic-size inconsistency. Check launcher rendering; not a crash demonstrated by this task. |
| IconDuplicatesConfig |1 →1 | Duplicate resource maintenance; not a release security blocker. |
| IconLocation |1 →1 | Existing drawable icon location guidance; preserve until reviewed asset cleanup/visual verification. |
| IconDuplicates |1 →1 | Existing duplicate launcher image maintenance. No new network/runtime behavior. |
| UseKtx |8 →11 | Kotlin extension style alternatives for URI/JSON/preferences usage. New state writes use bounded `apply()` and contain no message contents/credentials. Style changes do not justify unrelated rewrites or warning suppression. |

Native security/reliability fixes also made outside these advisory categories: runtime notification permission path, account/expiry/dedupe checks, generic notification privacy, session-bound token lifecycle, redirect-disabled background refresh, and call-query preservation on notification tap. Native bridge and delivery still require device tests.

Remaining compiler warnings include existing status/navigation color deprecations, old WebView callbacks and Gradle9 compatibility notices. They are not asserted fixed or certified harmless for every future SDK. Target/compile36 build and current artifact inspection pass; edge-to-edge/back/OEM behavior remains NOT VERIFIED physically.
