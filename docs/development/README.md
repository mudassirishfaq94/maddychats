# Contributor setup

This guide is separate from Circlo's user-facing README. Do not use an old audit, sample environment or historical deployment note as proof of current behavior.

1. Use the Node version required by `package.json` and run `npm ci`.
2. Copy `.env.example` to a private local `.env` and configure a disposable local PostgreSQL database. Never copy production data or secrets into a development fixture.
3. Apply the tracked migrations with `npm run db:migrate`.
4. Run `npm run dev` and open the local URL it reports.
5. Run `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build`. Integration suites require the guarded disposable databases described in the [quality gate guide](../ITEM3_QUALITY_GATES.md).

For an existing worktree with dependencies installed in a parent directory, the production webpack builder can be selected with `npm run build -- --webpack`. Do not change application security to accommodate a local build configuration.

Android builds require the SDK/JDK described in the Android documentation and a matching local Firebase Android client file. Signing keys stay outside Git. Use the [current release candidate checklist](../android/RELEASE_CANDIDATE_2026-10-30.md), not a historical APK's certificate or version.

Deployment and storage instructions are in [DEPLOYMENT.md](../../DEPLOYMENT.md), the [VPS runbook](../BLUEHOST_VPS_MIGRATION.md), and the [private storage migration guide](../CLOUDFLARE_R2_MEDIA_MIGRATION.md). These are engineering references, not user-facing privacy claims.

Before changing encryption, consult [current coverage](../security/encryption-current.md), trace the active caller and API, and add real negative tests. Preserve device approval, membership, message requests, expiry, account isolation and logout. Do not build a new cryptographic protocol from scratch or treat a passing placeholder as evidence.

Before any public source release, complete licence/notice and secret-history review. The private source package is supplied for review only; the current repository includes AGPL-licensed cryptographic components and this README is not a substitute for their licence obligations.
