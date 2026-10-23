# Circlo private media on Cloudflare R2

Circlo's images, videos, voice notes, avatars, and statuses are opaque media
objects. Message attachments remain end-to-end encrypted before upload. R2 is
used as a private object store behind Circlo's authenticated `/api/media` route;
the browser never receives R2 credentials or a public object URL. Neon remains
the metadata database. This does not move the Next.js website bundle or the
database to R2.

## Cloudflare setup

1. In Cloudflare, open **Storage & databases → R2 → Overview** and enable R2.
2. Create a private Standard bucket named `circlo-media` in the Circlo account.
   Do not enable public `r2.dev` access or attach a public custom domain.
3. Create an R2 API token scoped to this bucket with Object Read and Object
   Write permissions. Copy its Access Key ID and Secret Access Key once and
   store them directly in the deployment's secret environment settings. Never
   put them in Git, browser variables, screenshots, or chat.
4. Record the account ID shown in the R2 endpoint. Use `MEDIA_STORAGE_BACKEND=supabase`
   until a migration dry run reports an expected inventory.

Cloudflare's currently published Standard free tier includes 10 GB-month of
storage, 1 million Class A and 10 million Class B operations per month, and no
R2 egress fee. Storage/operations beyond those allowances are billed. These
allowances are not unlimited capacity.

## Copy and verify existing objects

Keep the current Supabase URL, service-role key, and bucket configured while
copying. Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_BUCKET=circlo-media` in a trusted local environment or private deployment
environment. Never print or commit these values.

Put the source and destination credentials in a local, gitignored `.env` file.
Run the inventory first; it does not write objects to either provider:

```sh
node --env-file=.env scripts/migrate-supabase-media-to-r2.mjs
```

Review object counts and byte totals. To copy, run:

```sh
node --env-file=.env scripts/migrate-supabase-media-to-r2.mjs --apply
```

The script copies the four application prefixes, checks destination object
sizes, resumes when an identical object is already present, stops rather than
overwriting a size mismatch, and never deletes from Supabase. Verify again:

```sh
node --env-file=.env scripts/migrate-supabase-media-to-r2.mjs --verify
```

The source remains intact for rollback. Use a maintenance window or pause
uploads during the final copy-and-verify pass so new uploads cannot be missed.

## Enable R2 safely

Only after verification, set `MEDIA_STORAGE_BACKEND=r2` in the app environment
and redeploy. Keep the Supabase server credentials temporarily: R2 is the write
target, reads fall back to Supabase for an object not yet copied, and deletion
removes both copies. This preserves existing media access while checking the
production app. Verify authenticated access, membership enforcement, encrypted
attachment downloads, avatars, statuses, expiry cleanup, and deletion.

After the rollback window and full verification, remove the Supabase Storage
credentials to disable fallback. Retain the source bucket until a separately
approved cleanup; do not delete it as part of this migration.

## Performance and privacy notes

Moving storage can increase available capacity and remove egress charges, but
does not by itself guarantee faster loads. Measure the same upload/download
paths before and after, from the app server and a physical Android device. The
app currently proxies private media through its authenticated server route, so
R2 credentials stay server-side and authorization continues to run before each
read. Public R2 URLs or direct browser access would weaken this design and are
not enabled here. Encrypted media cannot be resized or transcoded by the server;
thumbnail generation must happen client-side before encryption if it is needed.
