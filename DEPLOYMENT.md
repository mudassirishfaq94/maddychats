# Free Vercel deployment

This application is prepared for Vercel Hobby, Neon Free PostgreSQL, and a
private Vercel Blob store. Realtime events use a short-lived PostgreSQL queue,
so chat delivery works across independently scaled Vercel instances.

## 1. Create and connect Neon

The easiest route is through Vercel:

1. Import the Git repository into a Vercel project.
2. Open **Storage** or **Marketplace** in that project and add **Neon**.
3. Create a free Neon database and connect it to Production and Preview.
4. Confirm that Vercel created `DATABASE_URL`. The hostname should contain
   `-pooler`, which identifies Neon's pooled serverless connection.
5. In Neon, open **Connect**, disable connection pooling, and copy the direct
   URL as `DATABASE_URL_UNPOOLED`. Use this direct URL when running migrations.

You can also create Neon separately. In the Neon **Connect** dialog, enable
**Connection pooling** for the application `DATABASE_URL`; use the unpooled
version for `DATABASE_URL_UNPOOLED`.

Apply the committed schema before the first deployment:

```powershell
npm ci
$env:DATABASE_URL=$env:DATABASE_URL_UNPOOLED
npm run db:migrate
```

## 2. Create private Vercel Blob storage

1. In the Vercel project, open **Storage**.
2. Create a **Blob** store and select **Private** access. Access cannot be
   changed later.
3. Connect it to Production and Preview.
4. Vercel automatically injects `BLOB_READ_WRITE_TOKEN`.

Vercel Blob Hobby currently includes 1 GB of storage, 10 GB of Blob transfer,
10,000 simple operations, and 2,000 advanced operations per month. The store
becomes unavailable until its rolling allowance recovers if the limit is hit.

## 3. Configure Vercel variables

Add these under **Project Settings → Environment Variables**:

- `DATABASE_URL` — Neon pooled connection string
- `DATABASE_URL_UNPOOLED` — Neon direct connection string, for migrations only
- `JWT_SECRET` — output of `openssl rand -hex 32`
- `CLIENT_URL` — the production URL, such as `https://project.vercel.app`
- `BLOB_READ_WRITE_TOKEN` — normally injected by the Blob integration
- `SESSION_TTL_DAYS` — `365`
- `MAX_AVATAR_MB`, `MAX_IMAGE_MB`, `MAX_FILE_MB` — `3`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public key from `npm run vapid:generate`
- `VAPID_PRIVATE_KEY` — private key from the same command (keep secret)
- `VAPID_SUBJECT` — a contact URI such as `mailto:you@example.com`

Optional features require `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`, `RESEND_API_KEY`, and `EMAIL_FROM`.

### Firebase Phone Authentication

Enable the **Phone** provider in Firebase Authentication and add the Vercel
production and preview hostnames under **Authentication → Settings →
Authorized domains**. Add the six `NEXT_PUBLIC_FIREBASE_*` Web app values from
Firebase project settings and add `FIREBASE_PROJECT_ID` for server-side ID
token verification.

The browser uses Firebase only for reCAPTCHA and SMS verification. The server
verifies the resulting Firebase ID token and issues the existing HttpOnly
Maddy Chats session. OTP values are never sent to or stored in Neon.

Deploy, visit `/api/health`, and test two accounts, messages, reactions,
statuses, and private media. Never put either database URL, the JWT secret, or
the Blob token in source control or chat.

After adding the three VAPID values, redeploy (the public key is embedded at
build time). On every Android or desktop device, open **Settings →
Notifications** in Maddy Chats and select **Enable** once. The installed PWA
can then receive new-message notifications while it is closed.

## 4. Add a custom domain later

Add the domain under Vercel Project Settings, configure the displayed DNS
records, then change `CLIENT_URL` and `GOOGLE_CALLBACK_URL` to the new HTTPS
domain. Add the callback URL in Google Cloud Console and redeploy.

## Operational notes

- Vercel Hobby is for personal, non-commercial use.
- Multipart requests stay below Vercel's 4.5 MB function payload limit.
- SSE connections recycle before the five-minute function duration; browser
  `EventSource` reconnects automatically.
- Monitor the Vercel and Neon usage dashboards as adoption grows.
