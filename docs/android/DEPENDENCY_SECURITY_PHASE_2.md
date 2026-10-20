# Android tooling dependency investigation —16 October 2026

Scope: isolated `android-twa/package-lock.json`, Bubblewrap CLI/core1.27.0. It is not shipped in the web app or the existing hosted-WebView APK. Root production dependency audit independently reports zero findings. No risk acceptance, advisory suppression, forced CLI downgrade or production credential use was performed.

The original **14 entries (9 high/5 moderate) are not14 distinct vulnerabilities**: npm propagates vulnerable leaf dependencies to their parents. There are five distinct advisory identifiers across four leaf packages. Original tree and advisory details were obtained through `npm audit --json`; package versions were read from the lockfile and npm registry.

## Leaf advisories and remediation

| Package / original version | Identifier | Dependency path | Exposure and Circlo impact | Published fix / decision |
|---|---|---|---|---|
| extract-zip1.7.0 | [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv), CVE-2026-56876 | CLI→core→extract-zip | Build-tool ZIP extraction can follow unsafe symlinks outside the output directory. A malicious SDK archive could modify the build machine; it is not an app runtime library. | Registry latest2.0.1 remains affected; advisory lists no patched release. Do not use Bubblewrap's downloader. Keep the release guard closed. |
| extract-zip1.7.0 | [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3) | Same | Separate archive-entry traversal advisory; same build-machine boundary. | No unaffected published extract-zip found. Do not label official HTTPS download alone a complete mitigation. |
| node-forge1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), CVE-2026-85393 | CLI→core→googleapis81→google-auth-library7.14.1→gtoken5.3.2→google-p12-pem3.1.4→node-forge | Signature verification can accept malformed algorithm structures. This tree supports Google service-account/P12 tooling, not Circlo's browser E2EE. No service-account/private key was supplied; publishing commands are forbidden. Reachability with an actual service-account flow was not exercised. | Registry latest1.4.0 still affected; no patched release verified. Do not claim harmless merely because it is development-only. No publishing/signing acceptance granted. |
| file-type16.5.4 | [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) | CLI→core→jimp0.22.12→@jimp/custom→@jimp/core→file-type | A malformed ASF container can stall parsing during build-time image inspection. Only reviewed Circlo assets should be inputs, but that does not erase the advisory. | Patched21.3.1+, current22.2.0. Those exports/API/module format differ from legacy Jimp's CJS `fromBuffer` usage. No blind incompatible override. Requires a reviewed upstream/adapter change and malformed-input regression before acceptance. |
| uuid8.3.2 | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | CLI→core→googleapis→googleapis-common5.1.0→uuid | Buffer-size handling affects selected UUID APIs; the inspected Google client uses CommonJS `uuid.v4()` for multipart boundaries. Not shipped in the Android/web runtime. | **FIXED locally:** scoped override to11.1.1, retaining CJS support. Test resolves UUID from the actual Google client's dependency context, validates v4 and verifies an undersized v5 buffer throws. No network, credentials or API calls. |

## Every original npm finding entry

| Entry | Version | Original severity | Source / status |
|---|---|---|---|
| @bubblewrap/cli |1.27.0|high|Inherited from core; unresolved |
| @bubblewrap/core |1.27.0|high|extract-zip/googleapis/Jimp chains; unresolved |
| @jimp/core |0.22.12|moderate|file-type; unresolved |
| @jimp/custom |0.22.12|moderate|@jimp/core; unresolved |
| extract-zip |1.7.0|high|Two direct ZIP advisories; unresolved |
| file-type |16.5.4|moderate|Direct parser advisory; unresolved |
| google-auth-library |7.14.1|high|gtoken/node-forge chain; unresolved |
| google-p12-pem |3.1.4|high|node-forge; unresolved |
| googleapis |81.0.0|high|Google auth/common chains; unresolved |
| googleapis-common |5.1.0|high|Google auth and original UUID chain; UUID fixed, high inherited risk remains |
| gtoken |5.3.2|high|google-p12-pem; unresolved |
| jimp |0.22.12|moderate|file-type through @jimp packages; unresolved |
| node-forge |1.4.0|high|Direct signature advisory; unresolved |
| uuid |8.3.2→11.1.1|moderate|Resolved by scoped compatible override and regression |

After the fix: **13 entries:9 high/4 moderate**. The fail-closed CLI wrapper still refuses to load Bubblewrap. `npm audit fix --force` proposes obsolete CLI0.5.1 and was not used. No ignored findings were added.

## Reproducible commands

From `android-twa`: `npm ci --ignore-scripts`, `npm test`, `npm run test:dependencies`, `npm audit --json`, `npm run bubblewrap -- doctor`. Expected final command: STOP with9 high/4 moderate, before SDK downloads or generation. In root: `npm audit --omit=dev --audit-level=high` reports zero vulnerabilities. No audit result guarantees absence of all security defects.

## Safe route forward

The user's existing Android experience is a hosted WebView/native-helper build, not a Bubblewrap build. **Reuse that existing Gradle project for local Android verification**, without exposing it to this optional Node toolchain. This is an architectural observation, not acceptance of unresolved Bubblewrap risks. Do not generate a replacement TWA just to work around tooling findings.

If TWA remains the final chosen shell, require reviewed upstream fixes or a narrowly scoped patched toolchain. Any container alternative must be reproducible, run without production credentials/keys, use read-only verified inputs, restrict egress, and be assessed for the same dependency vulnerabilities. Container isolation alone does not fix parser/signature defects or justify signing compromised output. No such risk acceptance or container build was performed.

Final release signing and package choice remain owner-approved operations. The local existing-project debug build is a test artifact, not a signed Play release.
