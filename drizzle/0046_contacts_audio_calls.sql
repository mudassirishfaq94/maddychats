ALTER TABLE users ADD COLUMN verified_phone text;
ALTER TABLE users ADD COLUMN phone_discoverable boolean NOT NULL DEFAULT false;
CREATE INDEX users_discoverable_phone_idx ON users(verified_phone) WHERE phone_discoverable;
CREATE TABLE user_contacts (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id, contact_id), CHECK(owner_id <> contact_id)
);
CREATE TABLE audio_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caller_client uuid NOT NULL,
  callee_client uuid,
  offer text NOT NULL,
  answer text,
  caller_seen_at timestamptz NOT NULL DEFAULT now(),
  callee_seen_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'ringing' CHECK(state IN ('ringing','active','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '45 seconds',
  CHECK(caller_id <> callee_id)
);
CREATE INDEX audio_calls_caller_live_idx ON audio_calls(caller_id, expires_at) WHERE state <> 'ended';
CREATE INDEX audio_calls_callee_live_idx ON audio_calls(callee_id, expires_at) WHERE state <> 'ended';
CREATE INDEX audio_calls_expiry_idx ON audio_calls(expires_at);
ALTER TABLE user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_contacts, audio_calls FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
    EXECUTE format('REVOKE ALL ON user_contacts, audio_calls FROM %I', r);
  END LOOP;
END $$;
