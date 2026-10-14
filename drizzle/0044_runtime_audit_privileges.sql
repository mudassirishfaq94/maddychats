-- Runtime role enrollment remains separate from schema migration credentials.
-- Existing enrolled deployments also receive append-only audit privileges.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'circlo_runtime') THEN
    REVOKE CREATE ON SCHEMA public FROM circlo_runtime;
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.admin_audit_log FROM circlo_runtime;
  END IF;
END $$;
