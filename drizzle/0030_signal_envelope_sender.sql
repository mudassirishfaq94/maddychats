-- The mailbox needs a stable remote Signal address (account + device) before
-- attempting a persistent-ratchet decrypt. This value is server-derived from
-- the authenticated sender, never supplied by the client.
ALTER TABLE "e2ee_signal_envelopes"
  ADD COLUMN IF NOT EXISTS "sender_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;

UPDATE "e2ee_signal_envelopes" AS envelope
SET "sender_user_id" = message."sender_id"
FROM "messages" AS message
WHERE envelope."message_id" = message."id"
  AND envelope."sender_user_id" IS NULL;

ALTER TABLE "e2ee_signal_envelopes"
  ALTER COLUMN "sender_user_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "e2ee_signal_envelopes_sender_idx"
  ON "e2ee_signal_envelopes" ("sender_user_id", "sender_device_id");
