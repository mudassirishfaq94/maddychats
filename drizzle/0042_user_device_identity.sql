-- The account profile shows a device label and a country. Both were declared in
-- the schema and selected by sign-in, but no migration ever created them, so an
-- additive, idempotent statement is needed before the app can read a user row.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "device_name" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "country" text;
