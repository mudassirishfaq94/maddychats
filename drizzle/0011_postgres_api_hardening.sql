DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'users', 'oauth_accounts', 'password_reset_tokens', 'realtime_events',
		'conversations', 'conversation_members', 'message_mentions', 'messages',
		'message_reactions', 'message_reads', 'message_attachments', 'message_stars',
		'pinned_messages', 'message_deletions', 'blocks', 'notifications',
		'notification_preferences', 'statuses', 'status_views', 'status_recipients',
		'status_reactions'
	]
	LOOP
		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
			EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
		END IF;
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
			EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
		END IF;
	END LOOP;
END $$;
