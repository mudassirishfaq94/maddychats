ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "favorited_at" timestamp with time zone;
