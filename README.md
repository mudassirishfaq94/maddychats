# Maddy Chats

A chat-first messaging application with persistent direct conversations,
realtime delivery, presence, typing indicators, read receipts, reactions,
replies, private media, notifications, search, and responsive light/dark UI.

## Architecture

```text
React + TypeScript client
        │
        │ same-origin HTTP + authenticated realtime stream
        ▼
Next.js Route Handlers (Node.js API layer)
        │
        ├── bcrypt password hashing
        ├── signed JWT sessions in HttpOnly cookies
        ├── request validation / rate limiting / authorization
        ├── local filesystem media storage
        └── realtime pub/sub
        │
        ▼
Drizzle ORM
        │
        ▼
PostgreSQL
```

React never connects directly to PostgreSQL. Database credentials, JWT signing
material, password hashes, and private file paths stay server-side.

> **Express/Prisma compatibility note:** this repository runs in a
> platform-managed Next.js environment. The Node API layer therefore uses
> Next.js Route Handlers instead of a separately started Express process, and
> the platform-provided ORM is Drizzle instead of Prisma. The application still
> follows the same client → Node API → ORM → PostgreSQL separation. Do not add a
> direct browser-to-database connection.

### Project map

```text
src/
├── app/
│   ├── api/                       # authenticated Node.js HTTP endpoints
│   ├── app/                       # protected chat, people, profile pages
│   ├── login|register|forgot-password/
│   └── page.tsx                   # public landing page
├── components/
│   ├── auth/                      # auth forms and layout
│   ├── chats/                     # list, messages, composer, media, search
│   ├── people/                    # user directory
│   ├── profile/                   # profile settings
│   ├── providers/                 # auth and realtime client state
│   └── shell/                     # compact app header and notifications
├── db/
│   ├── index.ts                   # PostgreSQL pool + Drizzle client
│   └── schema.ts                  # tables, foreign keys, indexes, relations
├── lib/                           # shared validation schemas and DTO types
├── server/                        # server-only auth, chat, storage, presence
└── proxy.ts                       # Next.js 16 protected-route interception
scripts/
├── seed.mjs                       # development-only User A/User B seed
└── smoke-test.sh                  # full end-to-end QA suite
server/uploads/                    # runtime media (git-ignored)
```

## Features

- Registration and login by username or email
- bcrypt(12) password hashes; password hashes never enter API responses
- Seven-day signed JWT session in an HttpOnly cookie
- Server-side session revocation on logout
- Editable display name, username, bio, and avatar
- Searchable user directory and public profiles
- Duplicate-safe direct conversations
- Cursor-paginated message history
- Text, image, and file messages
- Realtime new/edit/delete events
- Realtime presence and typing indicators without polling
- Sent, delivered, and read states
- Reactions, replies, edit, copy, and soft delete
- Message search, persistent notifications, unread counts
- Pin, mute, archive, mark-unread, and delete-for-me controls
- Backend-enforced blocking
- Light, dark, and system themes
- Responsive conversation-list → full-screen-chat mobile flow

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL 15 or newer

## Installation

```bash
git clone <repository-url>
cd maddychats
npm install
cp .env.example .env
```

Create a PostgreSQL database:

```bash
createdb maddy_chats
```

Or with `psql`:

```bash
psql -U postgres -c 'CREATE DATABASE maddy_chats;'
```

Set `DATABASE_URL` and `JWT_SECRET` in `.env`, then apply the schema:

```bash
npx drizzle-kit push
```

The schema includes users, conversations, memberships, messages, attachments,
reactions, reads, blocks, and notifications, with foreign keys, cascade rules,
unique constraints, and access-pattern indexes.

## Environment variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/maddy_chats
JWT_SECRET=replace-with-a-long-random-string
PORT=3000
CLIENT_URL=http://localhost:3000

MAX_AVATAR_MB=5
MAX_IMAGE_MB=10
MAX_FILE_MB=25

# Development seed only; never configure in production
# DEV_SEED_PASSWORD=choose-a-local-password
```

Generate a signing secret with:

```bash
openssl rand -hex 32
```

- `.env` and all `.env.*` files are ignored by Git.
- `.env.example` contains placeholders only.
- Only variables prefixed with `NEXT_PUBLIC_` may enter browser bundles. This
  application does not expose database or signing secrets through such vars.

## ORM and migrations

The ORM configuration is `drizzle.config.ts` and reads `DATABASE_URL` from the
environment. The schema is `src/db/schema.ts`.

Apply the current schema to a local database:

```bash
npx drizzle-kit push
```

Inspect pending schema changes without editing credentials into config files:

```bash
npx drizzle-kit generate
```

## Development seed

Create or refresh two reserved development users:

```bash
DEV_SEED_PASSWORD='choose-a-dev-password' node scripts/seed.mjs
```

This creates:

- `User A` (`user_a`, `user.a@maddychats.local`)
- `User B` (`user_b`, `user.b@maddychats.local`)

The password is read only from `DEV_SEED_PASSWORD` and is not printed. The
script hashes it with bcrypt(12), is idempotent, and **refuses to run when
`NODE_ENV=production`**. Seed users are never rendered or exposed by a
production-only code path.

## Development and startup

This deployment uses a unified Next.js process: React pages and the Node API
start together. There is no separate frontend/database connection or second
Express process.

```bash
npm run dev          # React frontend + Node API, development mode
npm run build        # optimized production build
npm start            # start the built frontend + backend
npm run lint         # ESLint
npm run typecheck    # TypeScript
```

Open `http://localhost:3000`.

## Realtime architecture and Socket.IO compatibility

The managed runtime cannot replace its production start command with a custom
HTTP server, which Socket.IO requires. Realtime delivery therefore uses an
authenticated Server-Sent Events endpoint:

```text
GET /api/realtime/stream
```

Clients send authorized ephemeral events such as typing through narrow REST
routes; the server publishes normalized events to the recipient’s stream:

```text
message:new          message:update       message:delete
message:delivered    message:read         typing:update
presence:update      notification:new     conversation:new/delete
```

This preserves Socket.IO-style event semantics while remaining compatible with
the platform runtime. Authentication always comes from the HttpOnly session,
conversation membership is checked server-side, client-supplied user IDs are
never trusted, streams are capped per account, EventSource reconnects
natively, and all listeners/timers are cleaned up on unmount or disconnect.

For a deployment with a custom Express/Node server, the same event contracts
can be moved to Socket.IO by replacing the stream/provider transport. For
multiple application instances, use Redis pub/sub behind `src/server/realtime.ts`
and shared presence storage; the current in-memory bus is intentionally
single-instance V1 architecture.

## Media storage

Runtime files are stored under:

```text
server/uploads/
├── avatars/
├── images/
└── files/
```

The directory is git-ignored. PostgreSQL stores metadata only; binary contents
are never stored in database columns. Original filenames are sanitized for
display only. Actual stored filenames are generated server-side.

Uploads enforce:

- Authentication
- Conversation membership for message files
- MIME and extension allow-lists
- Executable and active-content rejection
- Configurable size limits
- Path traversal prevention
- Maximum attachment count

Private attachments are never served as unrestricted static files. Access goes
through `GET /api/media/:id`, which verifies the user belongs to the owning
conversation. Deleted-message attachments return 404.

Local disk is suitable for V1 development and a single persistent server. For
production horizontal scaling, replace the storage adapter with durable object
storage while preserving the authenticated media API.

## API overview

```text
/api/auth/*                              registration, login, logout, session
/api/users/*                             profiles, search, block/unblock
/api/conversations/*                     direct chats, messages, reads, controls
/api/messages/*                          edit/delete/reactions
/api/upload/avatar                       avatar upload
/api/upload/message                      message attachment upload
/api/media/*                             authorized private media
/api/search/messages                     authorized message search
/api/notifications/*                     persistent notification feed
/api/realtime/stream                     authenticated realtime channel
```

All private routes authenticate server-side. Conversation, message, media, and
notification endpoints independently enforce ownership or membership.

## Testing and QA

Run the application, then execute:

```bash
DATABASE_URL='postgresql://user:password@localhost:5432/maddy_chats' \
  ./scripts/smoke-test.sh http://localhost:3000
```

The suite creates isolated random QA users and tests registration, login,
profile persistence, direct-chat deduplication, two-way realtime messages,
typing, reactions, replies, edits, deleted state, read receipts, presence
disconnect/reconnect, image/PDF/text uploads, invalid and oversized uploads,
media authorization, notifications, controls, blocking, search, pagination,
logout/re-login persistence, and bcrypt storage.

Release validation:

```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run build
```

## Deployment notes

- Set a persistent, random `JWT_SECRET`; never use the development fallback in
  a public deployment.
- Serve over HTTPS so session cookies use `Secure; HttpOnly; SameSite=None`
  where cross-site embedding is required.
- Keep `CLIENT_URL` restricted to the real client origin.
- Use a persistent volume for `UPLOAD_DIR`, or replace local storage with a
  durable storage adapter.
- The V1 realtime bus is single-process. Use Redis pub/sub and shared presence
  for multiple instances.
- Apply schema changes before accepting traffic.
- Run the smoke suite against the deployed origin before promotion.
- Do not commit `.env`, uploads, credentials, test passwords, or private keys.
