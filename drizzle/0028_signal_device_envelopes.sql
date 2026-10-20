-- Per-device Signal ciphertext envelopes. The server stores opaque bytes only;
-- each recipient device gets an independently ratcheted ciphertext.
CREATE TABLE IF NOT EXISTS "e2ee_signal_envelopes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "sender_device_id" text NOT NULL,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_device_id" text NOT NULL,
  "protocol_version" integer NOT NULL DEFAULT 2,
  "ciphertext" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "delivered_at" timestamp with time zone,
  CONSTRAINT "e2ee_signal_envelopes_recipient_unique"
    UNIQUE ("message_id", "recipient_device_id")
);
CREATE INDEX IF NOT EXISTS "e2ee_signal_envelopes_mailbox_idx"
  ON "e2ee_signal_envelopes" ("recipient_user_id", "recipient_device_id", "delivered_at", "created_at");
