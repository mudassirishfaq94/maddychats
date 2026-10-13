CREATE TABLE "device_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "refresh_hash" text NOT NULL,
  "previous_hash" text,
  "previous_valid_until" timestamptz,
  "generation" integer NOT NULL DEFAULT 0,
  "user_agent" text NOT NULL,
  "auth_time" bigint NOT NULL,
  "mfa_time" bigint NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);
CREATE INDEX "device_sessions_user_idx" ON "device_sessions"("user_id");
CREATE INDEX "device_sessions_expires_idx" ON "device_sessions"("expires_at");
ALTER TABLE "device_sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "device_sessions" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON device_sessions FROM anon'; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON device_sessions FROM authenticated'; END IF;
END $$;
