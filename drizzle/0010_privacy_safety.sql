-- Older production databases applied this feature outside the migration journal.
DO $$ BEGIN
  IF to_regtype('public.report_type') IS NULL THEN
    CREATE TYPE report_type AS ENUM ('user', 'message');
  ELSIF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
         FROM pg_enum WHERE enumtypid = 'public.report_type'::regtype)
         IS DISTINCT FROM ARRAY['user', 'message']::text[] THEN
    RAISE EXCEPTION 'Incompatible existing report_type enum';
  END IF;
END $$;

-- Older production databases applied this feature outside the migration journal.
DO $$ BEGIN
  IF to_regtype('public.report_reason') IS NULL THEN
    CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'misinformation', 'impersonation', 'scam', 'other');
  ELSIF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
         FROM pg_enum WHERE enumtypid = 'public.report_reason'::regtype)
         IS DISTINCT FROM ARRAY['spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'misinformation', 'impersonation', 'scam', 'other']::text[] THEN
    RAISE EXCEPTION 'Incompatible existing report_reason enum';
  END IF;
END $$;

-- Older production databases applied this feature outside the migration journal.
DO $$ BEGIN
  IF to_regtype('public.report_status') IS NULL THEN
    CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
  ELSIF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
         FROM pg_enum WHERE enumtypid = 'public.report_status'::regtype)
         IS DISTINCT FROM ARRAY['pending', 'reviewed', 'resolved', 'dismissed']::text[] THEN
    RAISE EXCEPTION 'Incompatible existing report_status enum';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type report_type NOT NULL,
  reason report_reason NOT NULL,
  description text,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  status report_status NOT NULL DEFAULT 'pending',
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
CREATE INDEX IF NOT EXISTS reports_target_user_idx ON reports(target_user_id);
CREATE INDEX IF NOT EXISTS reports_reporter_idx ON reports(reporter_id);

CREATE TABLE IF NOT EXISTS login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  success boolean NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history(user_id);
CREATE INDEX IF NOT EXISTS login_history_created_idx ON login_history(created_at);

CREATE TABLE IF NOT EXISTS user_2fa (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_visibility text NOT NULL DEFAULT 'everyone',
  last_seen_visibility text NOT NULL DEFAULT 'everyone',
  status_visibility text NOT NULL DEFAULT 'everyone',
  who_can_message text NOT NULL DEFAULT 'everyone',
  login_alerts boolean NOT NULL DEFAULT true,
  read_receipts boolean NOT NULL DEFAULT true,
  typing_indicators boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_idx ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log(created_at);
