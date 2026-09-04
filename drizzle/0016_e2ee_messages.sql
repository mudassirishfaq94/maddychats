-- End-to-end encryption for messages and attachments.
-- Encrypted messages store only ciphertext; the client holds the keys.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false;

ALTER TABLE message_attachments
  ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enc_key text;

ALTER TABLE scheduled_messages
  ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false;