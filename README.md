# Maddy Chats

**Chat. Connect. Stay in sync.**

A real-time chat application. This repository contains **V1 — Step 1: Foundation + Authentication**.

> Chat functionality is intentionally **not** built yet. This step delivers the
> project architecture, PostgreSQL + Prisma data layer, a secure Express API,
> JWT authentication, protected routes, and a premium authenticated app shell.

---

## Architecture

```
React (client)          ← Vite + TypeScript + Tailwind CSS
  ↓  HTTP (same-origin, /api proxied)
Express API (server)    ← Node.js + Express + TypeScript
  ↓
Prisma ORM
  ↓
PostgreSQL (maddy_chats)
```

React never talks to PostgreSQL directly — every data access goes through the
Express API → Prisma → PostgreSQL.

```
client/   # React + TypeScript + Tailwind frontend
server/   # Node.js + Express + TypeScript + Prisma backend
```

## Tech stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** bcrypt password hashing, JWT in HttpOnly cookies
- **Security:** Helmet, CORS, express-rate-limit, Zod validation
- _(Socket.IO and local filesystem media storage arrive in a later step.)_

---

## Prerequisites

- Node.js 18+ (tested on Node 22)
- A PostgreSQL database

This repo bundles a **real, local PostgreSQL 18** via the `embedded-postgres`
npm package, so no system install is required for development. See below.

---

## Getting started

### 1. Install dependencies

```bash
npm install            # root (concurrently)
npm --prefix server install
npm --prefix client install
```

Or simply run `npm run setup` from the root.

### 2. Configure environment

```bash
cp server/.env.example server/.env
```

Fill in the values (defaults work out of the box with the bundled database):

```env
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/maddy_chats?schema=public"
JWT_SECRET="change-me-to-a-long-random-string"
PORT=4000
CLIENT_URL="http://localhost:5173"
```

`.env` is git-ignored and must never be committed.

### 3. Start the bundled PostgreSQL (development only)

```bash
npm run db:start       # starts the embedded PostgreSQL cluster
```

> In production you point `DATABASE_URL` at your own managed PostgreSQL and skip
> this step entirely.

### 4. Run Prisma migration

```bash
npm run db:migrate
```

### 5. Run the app

```bash
npm run dev            # runs server + client together
```

- Client: http://localhost:5173
- API:    http://localhost:4000/api

---

## API

| Method | Route                | Auth | Description                         |
| ------ | -------------------- | ---- | ----------------------------------- |
| POST   | `/api/auth/register` | no   | Create account                      |
| POST   | `/api/auth/login`    | no   | Log in, sets HttpOnly cookie        |
| POST   | `/api/auth/logout`   | yes* | Clears auth cookie                  |
| GET    | `/api/auth/me`       | yes  | Current user (no `passwordHash`)    |
| GET    | `/api/health`        | no   | Health + DB connectivity check      |

`passwordHash` is never returned by any endpoint.

---

## Security

- bcrypt password hashing (never plaintext)
- JWT authentication stored in an HttpOnly, SameSite cookie
- Authentication middleware; protected routes reject unauthenticated requests
- Zod request validation with safe, structured error responses
- Helmet security headers
- Strict CORS configuration
- Rate limiting on auth endpoints
- No database credentials or JWT secret in the frontend
- `passwordHash` never leaves the API

---

## Scripts (root)

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run setup`     | Install all workspace dependencies               |
| `npm run db:start`  | Start bundled local PostgreSQL                   |
| `npm run db:migrate`| Run Prisma migrations                            |
| `npm run dev`       | Run server + client in development               |
| `npm run build`     | Production build of server + client              |
| `npm run verify`    | Run the automated auth acceptance test suite     |
