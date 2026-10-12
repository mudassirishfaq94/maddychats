ALTER TABLE e2ee_keys ADD COLUMN session_id uuid REFERENCES device_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE device_link_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
 device_id text NOT NULL, fingerprint text NOT NULL, code_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX device_link_owner_idx ON device_link_requests(user_id, expires_at);
