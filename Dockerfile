FROM node:22.23.4-alpine3.24 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY scripts/harden-braces.mjs ./scripts/harden-braces.mjs
RUN npm ci

FROM base AS builder
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG APP_VERSION=development
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM dependencies AS migrator
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src/db/schema.ts ./src/db/schema.ts
COPY scripts/certs/supabase-ca.crt ./scripts/certs/supabase-ca.crt
ENV NODE_EXTRA_CA_CERTS=/app/scripts/certs/supabase-ca.crt
USER node
CMD ["npm", "run", "db:migrate"]

FROM base AS worker
COPY --chown=node:node scripts/scheduled-worker.mjs ./scripts/scheduled-worker.mjs
USER node
CMD ["node", "scripts/scheduled-worker.mjs"]

FROM node:22.23.4-alpine3.24 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chown=nextjs:nodejs scripts/readiness.mjs scripts/reconstruct-status-photo.mjs ./scripts/
COPY --chown=nextjs:nodejs scripts/certs/supabase-ca.crt ./scripts/certs/supabase-ca.crt
RUN mkdir -p /app/server/uploads /app/.next/cache && chown -R nextjs:nodejs /app/server /app/.next/cache
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_EXTRA_CA_CERTS=/app/scripts/certs/supabase-ca.crt
CMD ["node", "server.js"]
