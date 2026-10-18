-- Separate opt-in envelopes. Existing identities and conversation keys are never rewritten.
CREATE TABLE recovery_backups (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_id text NOT NULL,
 envelope jsonb NOT NULL CHECK (octet_length(envelope::text)<=12582912), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 confirmed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recovery_backups_user_updated_idx ON recovery_backups(user_id,updated_at);
ALTER TABLE recovery_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recovery_backups FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN EXECUTE format('REVOKE ALL ON recovery_backups FROM %I',api_role); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='circlo_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON recovery_backups TO circlo_runtime;
  CREATE POLICY circlo_runtime_server_access ON recovery_backups FOR ALL TO circlo_runtime USING(true) WITH CHECK(true);
 END IF;
END $$;
-- Rollback: disable new backup writes; retain envelopes and restore access. Never drop recoverable encryption data as an automatic rollback.
