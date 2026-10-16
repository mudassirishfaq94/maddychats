# Phase 3: isolated Bubblewrap preparation, not a release

16 October2026. `android-twa/` contains a separate pinned Bubblewrap1.27.0 package/lockfile, local-input example, config/DAL candidate generator, source preflight, a guarded CLI wrapper, tests and build/acceptance instructions. No root application dependency changed. The whole tooling directory and all keystores are excluded from the production Docker context.

## Actual verification

- `npm --prefix android-twa test`:2 passed,0 failed. Canonical origin/notification delegation/Custom Tabs fallback and empty additional trust/features; reject malformed identity/fingerprint, known-old package version, in-repository key paths and credential properties.
- `npm --prefix android-twa run configure`: correctly refuses missing confirmed release inputs. No dummy production package/key or public assetlinks file created.
- `npm --prefix android-twa run preflight`: correctly fails missing generated inputs/project and lists the remaining artifact/device/Console checks. This expected failure is not described as a readiness pass.
- `npm --prefix android-twa run bubblewrap -- doctor`: correctly stops **before loading Bubblewrap**, because the isolated tooling audit is not clean. No Java/SDK download, license acceptance, key creation, signing or generation occurred.
- Inspected pinned Bubblewrap core template: compile/targetSDK36. This is source evidence, not an inspected compiled artifact. Inspected CLI update source to keep generation within `android-twa/project`.
- Root `npm audit --omit=dev --audit-level=high`: **zero vulnerabilities**. This does not cover every runtime risk or the isolated tooling tree.
- Root lint/typecheck and the TWA directory secret scan: PASS. No signing credentials or generated release outputs were staged.

## Additional release blocker discovered during preparation

The pinned latest CLI install produced14 audit findings:9high and5moderate. Affected chains include extract-zip archive traversal, node-forge signature verification, legacy Google API/auth dependencies and Jimp/file-type. `npm view` found current published extract-zip2.0.1 and node-forge1.4.0 still inside the advisory ranges at audit time. npm's proposed forced CLI downgrade to0.5.1 is not a safe remediation. Arbitrarily overriding old CJS APIs with incompatible major ESM versions would not constitute a verified fix.

The toolchain is therefore **FAIL / blocked**, isolated from the application runtime and unavailable through the wrapper until its audit succeeds. Do not provide production secrets or run archive downloads/signing with it. A reviewed patched upstream toolchain or separately reviewed remediation is required; no unsupported third-party replacement or broad exception was introduced.

Source preparation is complete. Actual TWA generation/build/signing remains blocked by the tooling findings and unconfirmed Play package/signing identity; real-device verification also needs Android tooling/phones. The public DAL404, external deletion/support path and operational Play declarations from the initial report remain unresolved. No infrastructure, Google Play or GitHub changes were made remotely.

## Phase summary

| Phase | State |
|---|---|
|1: Evidence-based readiness report | Complete, local commit `c778ce1` |
|2: Offline fix and signing-file Git safeguards | Verified locally, local commit `c7b1b3a`; not deployed |
|3: Separate TWA preparation | Prepared and tested; actual toolchain/build blocked as above |
|4–6: Operational compliance, signed/DAL-verified Android acceptance, release | NOT VERIFIED; owner decisions and additional environment required |

No app publication, push, paid resource or production configuration change occurred. No approval guarantee is made. Consult the README and the initial report for the exact remaining gates and acceptance matrix.
