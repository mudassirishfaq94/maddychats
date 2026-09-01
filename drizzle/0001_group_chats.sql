ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
CREATE TABLE IF NOT EXISTS "message_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_mentions_message_user_unique" UNIQUE("message_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "message_mentions_user_idx" ON "message_mentions" ("user_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'conversation_members_role_check'
  ) THEN
    ALTER TABLE "conversation_members"
      ADD CONSTRAINT "conversation_members_role_check"
      CHECK ("role" IN ('owner', 'admin', 'member'));
  END IF;
END $$;
