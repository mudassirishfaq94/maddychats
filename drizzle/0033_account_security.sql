ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- Only historical evidence of email ownership is backfilled. Password users
-- without that evidence verify their email on their next sign-in.
UPDATE users u SET email_verified_at = now() WHERE EXISTS
  (SELECT 1 FROM email_verification_tokens t WHERE t.user_id = u.id AND t.used_at IS NOT NULL);
ALTER TABLE user_2fa ADD COLUMN recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE user_2fa ADD COLUMN last_used_step integer;
CREATE TABLE mfa_challenges (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX mfa_challenges_expires_idx ON mfa_challenges(expires_at);
ALTER TABLE mfa_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mfa_challenges FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON mfa_challenges FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON mfa_challenges FROM authenticated; END IF;
END $$;
-- Encrypted voice transcripts must never be returned as plaintext.
UPDATE message_attachments a SET transcript = NULL WHERE a.encrypted = true
  OR EXISTS (SELECT 1 FROM messages m WHERE m.id = a.message_id AND m.encrypted = true);

-- Account deletion preserves the audit entry while its deleted actor becomes null.
ALTER TABLE admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;
