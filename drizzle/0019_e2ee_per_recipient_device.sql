-- Preserve a separate wrapped conversation key for every recipient device.
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN IF NOT EXISTS "recipient_device_id" text;
ALTER TABLE "e2ee_key_history" ADD COLUMN IF NOT EXISTS "recipient_device_id" text;
ALTER TABLE "e2ee_conversation_keys" DROP CONSTRAINT IF EXISTS "e2ee_conv_keys_unique";
ALTER TABLE "e2ee_conversation_keys" ADD CONSTRAINT "e2ee_conv_keys_recipient_unique" UNIQUE ("conversation_id", "user_id", "device_id", "recipient_device_id");
ALTER TABLE "e2ee_key_history" DROP CONSTRAINT IF EXISTS "e2ee_key_history_unique";
ALTER TABLE "e2ee_key_history" ADD CONSTRAINT "e2ee_key_history_recipient_unique" UNIQUE ("conversation_id", "user_id", "device_id", "recipient_device_id", "key_version");
CREATE INDEX IF NOT EXISTS "e2ee_conv_keys_recipient_idx" ON "e2ee_conversation_keys" ("conversation_id", "user_id", "recipient_device_id", "is_active");
CREATE INDEX IF NOT EXISTS "e2ee_key_history_recipient_idx" ON "e2ee_key_history" ("conversation_id", "user_id", "recipient_device_id");
