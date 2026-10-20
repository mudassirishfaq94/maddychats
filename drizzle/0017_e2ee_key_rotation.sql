-- Key rotation for forward secrecy
-- Old keys are kept for decryption but new messages use the latest key

-- Add rotation metadata to conversation keys
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN "key_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN "rotated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;

-- Index for efficient lookup of active keys
CREATE INDEX "e2ee_conv_keys_active_idx" ON "e2ee_conversation_keys" ("conversation_id", "user_id", "is_active");

-- Key history table: stores previous keys for decryption
-- Each row represents one historical key for a conversation
CREATE TABLE "e2ee_key_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" text NOT NULL,
  "encrypted_key" text NOT NULL,
  "key_version" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone
);

-- Index for efficient lookup of historical keys
CREATE INDEX "e2ee_key_history_conv_idx" ON "e2ee_key_history" ("conversation_id", "user_id");
CREATE INDEX "e2ee_key_history_version_idx" ON "e2ee_key_history" ("conversation_id", "key_version");

-- Unique constraint to prevent duplicate historical keys
ALTER TABLE "e2ee_key_history" ADD CONSTRAINT "e2ee_key_history_unique" UNIQUE ("conversation_id", "user_id", "device_id", "key_version");
