-- Notifications carry identifiers only. PostgreSQL emits these after commit;
-- consumers must still read private rows and authorize their recipients.
CREATE FUNCTION notify_realtime_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('ziptalk_realtime', json_build_array(NEW.user_id, NEW.id)::text);
  RETURN NEW;
END $$;
CREATE TRIGGER realtime_event_notify AFTER INSERT ON realtime_events
FOR EACH ROW EXECUTE FUNCTION notify_realtime_event();
CREATE INDEX realtime_events_replay_idx ON realtime_events(user_id, created_at, id);
--> statement-breakpoint
-- Preserve audit evidence. FK SET NULL is allowed only during referential
-- actions; immutable details retain identifiers when a subject is removed.
CREATE FUNCTION protect_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND (to_jsonb(NEW) - 'admin_id' - 'target_user_id' - 'target_message_id')
       = (to_jsonb(OLD) - 'admin_id' - 'target_user_id' - 'target_message_id')
     AND (NEW.admin_id IS NULL OR NEW.admin_id IS NOT DISTINCT FROM OLD.admin_id)
     AND (NEW.target_user_id IS NULL OR NEW.target_user_id IS NOT DISTINCT FROM OLD.target_user_id)
     AND (NEW.target_message_id IS NULL OR NEW.target_message_id IS NOT DISTINCT FROM OLD.target_message_id)
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION protect_admin_audit();
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON admin_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION protect_admin_audit();
