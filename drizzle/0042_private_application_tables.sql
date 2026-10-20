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
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
