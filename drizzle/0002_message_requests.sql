ALTER TABLE "conversation_members"
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;

UPDATE "conversation_members"
SET "accepted_at" = "joined_at"
WHERE "accepted_at" IS NULL;
