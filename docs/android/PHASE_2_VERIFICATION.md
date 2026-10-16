# Phase 2: offline recovery and Git safeguards

Baseline finding W05 in the readiness report was reproduced on the live site before edits: enforced CSP blocked the offline page's inline script, so Retry caused zero navigations.

The offline page now uses a normal GET form submitting to its current route. It works without JavaScript or CSP exceptions. Reconnection is deliberately manual through Try again; the former blocked automatic online listener is removed. The worker cache version is6 so a later authorized deployment will replace the broken cached document. No message, auth, encryption or private cache behavior changed.

Verification on16 October2026:

- `npm run test:pwa-offline`: PASS. The actual worker and offline HTML were served on loopback with the production CSP generator. A360px touch viewport navigated offline, retried offline, then reconnected and retried to the same chat path. No CSP refusals. Cache Storage contained only `/offline.html`.
- `npm run test:unit`:66 passed,0 failed, including the new signing/artifact exclusion test and existing security/notification/media regressions.
- `npm run typecheck` and `npm run lint`: PASS.
- CI now runs the isolated offline test after the existing browser installation/integration suite.

Global keystore/APK/AAB/APKS exclusions and local Bubblewrap configuration/generated-directory exclusions were added. Safe TWA source/examples remain visible to Git. Files were staged by name; no credentials or signing material generated.

This is local verification, not a production or signed Android TWA test. No changes were pushed or deployed. W05 remains a live-site issue until a later authorized deployment; the initial audit intentionally records the original failing evidence.
