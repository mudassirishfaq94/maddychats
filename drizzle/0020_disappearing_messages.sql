ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "disappearing_seconds" integer DEFAULT 0 NOT NULL;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "messages_expires_idx" ON "messages" ("expires_at");
