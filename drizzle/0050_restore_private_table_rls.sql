-- Forward repair for the historically unrecorded 0042; do not fabricate old ledger rows.
-- No user records or encryption material are changed.
-- Circlo uses server-owned PostgreSQL sessions, not Supabase Auth/Data API.
-- Deny browser Data API roles access to application tables. Owners retain
-- server access because RLS is enabled but deliberately not forced.
DO $$
DECLARE table_name text; api_role text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'stored_uploads',
    'users',
    'oauth_accounts',
    'device_sessions',
    'password_reset_tokens',
    'realtime_events',
    'email_verification_tokens',
    'rate_limit_buckets',
    'conversations',
    'conversation_members',
    'message_mentions',
    'messages',
    'message_reactions',
    'message_reads',
    'message_attachments',
    'message_stars',
    'pinned_messages',
    'message_deletions',
    'blocks',
    'notifications',
    'notification_preferences',
    'push_subscriptions',
    'fcm_tokens',
    'statuses',
    'status_views',
    'status_recipients',
    'status_reactions',
    'reports',
    'login_history',
    'user_2fa',
    'privacy_settings',
    'admin_audit_log',
    'group_invite_links',
    'scheduled_messages',
    'communities',
    'community_members',
    'channels',
    'e2ee_keys',
    'e2ee_signal_devices',
    'e2ee_signal_prekeys',
    'e2ee_signal_envelopes',
    'e2ee_conversation_keys',
    'e2ee_key_history',
    'mfa_challenges',
    'device_link_requests'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      -- Install the existing private backend's access policy in the same
      -- transaction as RLS, so serving traffic never sees a deny-all gap.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'circlo_runtime') THEN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='circlo_runtime'
          AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolinherit))
          OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='circlo_runtime') THEN
          RAISE EXCEPTION 'Refusing unexpected elevated runtime role';
        END IF;
        EXECUTE format('DROP POLICY IF EXISTS circlo_runtime_server_access ON public.%I',table_name);
        EXECUTE format('CREATE POLICY circlo_runtime_server_access ON public.%I FOR ALL TO circlo_runtime USING (true) WITH CHECK (true)',table_name);
        IF table_name = 'admin_audit_log' THEN
          REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_log FROM circlo_runtime;
        END IF;
      END IF;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
