-- Reconcile historical migrations that were absent from the journal.
-- Append-only: works after 0033 on fresh and already upgraded databases.

--> statement-breakpoint
-- Key rotation for forward secrecy
-- Old keys are kept for decryption but new messages use the latest key

-- Add rotation metadata to conversation keys
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN IF NOT EXISTS "key_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN IF NOT EXISTS "rotated_at" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "e2ee_conversation_keys" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;

-- Index for efficient lookup of active keys
CREATE INDEX IF NOT EXISTS "e2ee_conv_keys_active_idx" ON "e2ee_conversation_keys" ("conversation_id", "user_id", "is_active");

-- Key history table: stores previous keys for decryption
-- Each row represents one historical key for a conversation
CREATE TABLE IF NOT EXISTS "e2ee_key_history" (
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
CREATE INDEX IF NOT EXISTS "e2ee_key_history_conv_idx" ON "e2ee_key_history" ("conversation_id", "user_id");
CREATE INDEX IF NOT EXISTS "e2ee_key_history_version_idx" ON "e2ee_key_history" ("conversation_id", "key_version");


--> statement-breakpoint
-- FCM device tokens for Android native push notifications.
-- Capacitor PushNotifications plugin registers an FCM token per device;
-- the server stores it and uses the Firebase Admin SDK to deliver
-- notifications through the OS tray when the app is backgrounded.

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL DEFAULT 'android',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fcm_tokens_user_idx ON fcm_tokens(user_id);

--> statement-breakpoint
-- Custom chat background focal point (drag-to-position).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS background_position_x integer DEFAULT 50;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS background_position_y integer DEFAULT 50;

--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "disappearing_seconds" integer DEFAULT 0 NOT NULL;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "messages_expires_idx" ON "messages" ("expires_at");

--> statement-breakpoint
ALTER TABLE "conversation_members" ADD COLUMN IF NOT EXISTS "favorited_at" timestamp with time zone;

--> statement-breakpoint
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

--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN IF NOT EXISTS "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL;
ALTER TABLE "channels" ALTER COLUMN "created_by" DROP NOT NULL;
ALTER TABLE "communities" ALTER COLUMN "created_by" DROP NOT NULL;

--> statement-breakpoint
-- New server-only tables must not be exposed through Supabase's REST API.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['e2ee_key_history', 'fcm_tokens'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;
