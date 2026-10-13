-- One-time verified-mailbox proof for explicitly recovering this browser's
-- encryption trust. Codes are HMACs, bound to the pending browser/session/key.
CREATE TABLE IF NOT EXISTS device_recovery_email_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS device_recovery_email_codes_user_created_idx
  ON device_recovery_email_codes(user_id, created_at);
--> statement-breakpoint
ALTER TABLE device_recovery_email_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE device_recovery_email_codes FROM PUBLIC;
