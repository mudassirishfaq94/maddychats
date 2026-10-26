ALTER TABLE "device_link_requests" ADD COLUMN IF NOT EXISTS "entry_code_hash" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_link_entry_code_hash_unique" ON "device_link_requests" ("entry_code_hash");
