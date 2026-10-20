CREATE TABLE IF NOT EXISTS "status_reactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_id" uuid NOT NULL REFERENCES "statuses"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "status_reactions_status_user_unique" UNIQUE("status_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "status_reactions_status_idx" ON "status_reactions" ("status_id");
