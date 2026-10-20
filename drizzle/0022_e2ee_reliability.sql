-- Repair per-device E2EE key sharing and give randomized RSA-OAEP wraps a
-- stable identity. This migration is idempotent so it can safely repair
-- databases where earlier E2EE migrations were applied manually.

ALTER TABLE "e2ee_conversation_keys"
  ADD COLUMN IF NOT EXISTS "recipient_device_id" text,
  ADD COLUMN IF NOT EXISTS "key_fingerprint" text;

ALTER TABLE "e2ee_key_history"
  ADD COLUMN IF NOT EXISTS "recipient_device_id" text,
  ADD COLUMN IF NOT EXISTS "key_fingerprint" text;

ALTER TABLE "e2ee_conversation_keys"
  DROP CONSTRAINT IF EXISTS "e2ee_conv_keys_unique",
  DROP CONSTRAINT IF EXISTS "e2ee_conversation_keys_conversation_id_user_id_device_id_key";

ALTER TABLE "e2ee_key_history"
  DROP CONSTRAINT IF EXISTS "e2ee_key_history_unique";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'e2ee_conv_keys_recipient_unique'
  ) THEN
    ALTER TABLE "e2ee_conversation_keys"
      ADD CONSTRAINT "e2ee_conv_keys_recipient_unique"
      UNIQUE ("conversation_id", "user_id", "device_id", "recipient_device_id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'e2ee_key_history_recipient_unique'
  ) THEN
    ALTER TABLE "e2ee_key_history"
      ADD CONSTRAINT "e2ee_key_history_recipient_unique"
      UNIQUE ("conversation_id", "user_id", "device_id", "recipient_device_id", "key_version");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "e2ee_conv_keys_recipient_idx"
  ON "e2ee_conversation_keys" ("conversation_id", "user_id", "recipient_device_id", "is_active");

CREATE INDEX IF NOT EXISTS "e2ee_key_history_recipient_idx"
  ON "e2ee_key_history" ("conversation_id", "user_id", "recipient_device_id");
