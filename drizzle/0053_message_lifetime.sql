ALTER TABLE messages ADD COLUMN self_destruct boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN revealed_at timestamptz;
ALTER TABLE messages ADD CONSTRAINT self_destruct_fixed_lifetime CHECK (NOT self_destruct OR ((revealed_at IS NULL AND expires_at IS NULL) OR (revealed_at IS NOT NULL AND expires_at = revealed_at + interval '5 seconds')));
CREATE INDEX messages_expiry_cleanup_idx ON messages(expires_at,id) WHERE expires_at IS NOT NULL AND (deleted_at IS NULL OR text<>'');
-- Rollback readers must retain redaction and expiry enforcement. Never resurrect expired ciphertext.
