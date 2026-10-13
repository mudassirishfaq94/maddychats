-- Device identity for the readable device list: a human label, the platform
-- family, and the country observed when the device was enrolled. Every
-- statement is idempotent because earlier deployments added some of these
-- columns by hand.
ALTER TABLE "e2ee_keys" ADD COLUMN IF NOT EXISTS "device_name" text;
--> statement-breakpoint
ALTER TABLE "e2ee_keys" ADD COLUMN IF NOT EXISTS "country" text;
--> statement-breakpoint
ALTER TABLE "e2ee_keys" ADD COLUMN IF NOT EXISTS "platform" text;
--> statement-breakpoint
ALTER TABLE "e2ee_keys" ADD COLUMN IF NOT EXISTS "ip_country" text;
--> statement-breakpoint
ALTER TABLE "e2ee_keys" ADD COLUMN IF NOT EXISTS "ip_country_at" timestamp with time zone;
--> statement-breakpoint
-- A redeemed code must be marked used; the source device is recorded by device
-- id so trust can be re-checked without depending on a browser session.
ALTER TABLE "device_link_requests" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "device_link_requests" ADD COLUMN IF NOT EXISTS "source_device_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_link_pending_idx" ON "device_link_requests" ("user_id", "device_id", "status");
