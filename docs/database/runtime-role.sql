-- Run once with the migration owner against the application database.
-- Password enrollment is performed separately; never store it in this file.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='circlo_runtime') THEN
    CREATE ROLE circlo_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
-- Managed owners cannot ALTER SUPERUSER/BYPASSRLS attributes, even to false.
-- Refuse reuse of an elevated existing role instead of silently inheriting it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='circlo_runtime'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) THEN
    RAISE EXCEPTION 'circlo_runtime already exists with elevated privileges';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='circlo_runtime') THEN
    RAISE EXCEPTION 'circlo_runtime has unexpected role memberships';
  END IF;
END $$;
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO circlo_runtime', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO circlo_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM circlo_runtime;
-- Readiness checks migration state but the web role cannot change it.
GRANT USAGE ON SCHEMA drizzle TO circlo_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO circlo_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO circlo_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO circlo_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO circlo_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO circlo_runtime;
-- The web process may append/read audit events, never rewrite their history.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.admin_audit_log FROM circlo_runtime;
-- Existing RLS is deny-by-default to public API roles. This private backend
-- role needs the same rows the previous owner connection could access; the
-- application enforces each end user's authorization before issuing queries.
-- Grant only this role an explicit server policy, never anon/authenticated.
DO $$ DECLARE target record; BEGIN
  FOR target IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS circlo_runtime_server_access ON public.%I',target.relname);
    EXECUTE format('CREATE POLICY circlo_runtime_server_access ON public.%I FOR ALL TO circlo_runtime USING (true) WITH CHECK (true)',target.relname);
  END LOOP;
END $$;
