DO $$ BEGIN
  CREATE TYPE "public"."status_type" AS ENUM('text', 'image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "public"."status_privacy" AS ENUM('all', 'selected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" "status_type" NOT NULL,
  "text" text,
  "media_path" text,
  "media_mime_type" text,
  "background_style" text,
  "privacy" "status_privacy" DEFAULT 'all' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
CREATE INDEX IF NOT EXISTS "statuses_user_created_idx" ON "statuses" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "statuses_expires_idx" ON "statuses" ("expires_at");

CREATE TABLE IF NOT EXISTS "status_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_id" uuid NOT NULL REFERENCES "statuses"("id") ON DELETE CASCADE,
  "viewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "status_views_status_viewer_unique" UNIQUE("status_id", "viewer_id")
);
CREATE INDEX IF NOT EXISTS "status_views_viewer_idx" ON "status_views" ("viewer_id");

CREATE TABLE IF NOT EXISTS "status_recipients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status_id" uuid NOT NULL REFERENCES "statuses"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "status_recipients_status_user_unique" UNIQUE("status_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "status_recipients_user_idx" ON "status_recipients" ("user_id");
