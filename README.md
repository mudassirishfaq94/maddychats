# ZipTalk

ZipTalk is a full-stack direct-messaging application built with Next.js,
React, TypeScript, PostgreSQL, and Drizzle ORM. It supports persistent private
conversations, realtime delivery and presence, typing indicators, read
receipts, reactions, replies, search, notifications, private attachments, and
responsive light/dark themes.

For a free Vercel + Neon production setup, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Tech stack

- Next.js 16 with App Router and Route Handlers
- React 19 and TypeScript
- PostgreSQL with Drizzle ORM
- Server-Sent Events for realtime updates
- JWT sessions stored in HttpOnly cookies
- bcrypt password hashing
- Tailwind CSS 4

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL 15 or newer

## Local setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/mudassirishfaq94/maddychats.git
cd maddychats
npm install
```

Create a local environment file from the safe template:

```bash
cp .env.example .env
```

Configure `.env` with local values. Never commit this file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Server-only PostgreSQL connection string |
| `SESSION_TTL_DAYS` | No | Persistent login lifetime in days (default: 365, maximum: 3650) |
| `JWT_SECRET` | Production | Secret of at least 32 characters used to sign sessions |
| `PORT` | No | Application port; defaults to `3000` |
| `CLIENT_URL` | Recommended | Canonical application origin |
| `MAX_AVATAR_MB` | No | Avatar upload limit |
| `MAX_IMAGE_MB` | No | Message-image upload limit |
| `MAX_FILE_MB` | No | Message-file upload limit |
| `DEV_SEED_PASSWORD` | Seed only | Password for local development accounts |

Generate a production-quality session secret locally:

```bash
openssl rand -hex 32
```

Create the database, then apply the schema:

```bash
createdb maddy_chats
npx drizzle-kit push
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npx drizzle-kit push` | Apply the current schema to the database |
| `npx drizzle-kit generate` | Generate schema migration files |

## Development seed

The optional seed script creates two local test users. It requires an explicit
password and refuses to run when `NODE_ENV=production`.

```bash
DEV_SEED_PASSWORD='local-password-only' node scripts/seed.mjs
```

## Project structure

```text
src/
├── app/
│   ├── api/          # authenticated HTTP and realtime endpoints
│   └── app/          # protected application pages
├── components/       # auth, chat, profile, people, and shell UI
├── db/               # Drizzle connection and PostgreSQL schema
├── lib/              # shared validation, types, and utilities
└── server/           # server-only auth, chat, media, and realtime logic
scripts/
├── seed.mjs          # guarded local-development seed
└── smoke-test.sh     # end-to-end API and realtime checks
server/uploads/       # runtime media; excluded from Git
```

The browser communicates only with same-origin Next.js endpoints. Database
credentials, password hashes, signing material, and storage paths remain on
the server. Private media is served through authenticated routes that verify
conversation membership.

Realtime updates use the authenticated `/api/realtime/stream` Server-Sent
Events endpoint. The current event bus and presence store are process-local;
multi-instance deployments should replace them with shared infrastructure such
as Redis pub/sub.

## Testing

Run static checks before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run build
```

With the application and a test database running, execute the smoke suite:

```bash
./scripts/smoke-test.sh http://localhost:3000
```

The smoke suite creates isolated test accounts and exercises authentication,
profiles, conversations, realtime events, messages, reactions, uploads,
authorization, search, notifications, and persistence.

## Production checklist

- Set a unique, random `JWT_SECRET`; never rely on a fallback in production.
- Keep `DATABASE_URL`, `JWT_SECRET`, and seed credentials in the deployment
  platform's secret manager, not in source control or client-visible variables.
- Set `CLIENT_URL` to the exact HTTPS production origin.
- Apply database schema changes before accepting traffic.
- Use persistent private storage for uploads, or replace local storage with an
  object-storage adapter while preserving authorization checks.
- Use shared realtime and presence infrastructure when running more than one
  application instance.
- Run type checking, linting, a production build, and smoke tests before release.
- Never commit `.env` files, database dumps, logs, uploads, credentials,
  private keys, access tokens, or production user data.

## Security notes

- Authentication is enforced server-side with signed HttpOnly session cookies.
- Passwords are hashed with bcrypt and are never returned by API responses.
- Private routes independently verify ownership or conversation membership.
- Uploads enforce size and type restrictions and reject executable content.
- Only variables intentionally prefixed with `NEXT_PUBLIC_` can be exposed to
  browser bundles. Do not use that prefix for secrets.
- Report security issues privately to the repository owner rather than opening
  a public issue containing exploit details or sensitive data.
