CREATE TABLE temporary_rooms (
 id uuid PRIMARY KEY,
 invite_hash text NOT NULL UNIQUE CHECK (invite_hash ~ '^[a-f0-9]{64}$'),
 host_credential_hash text NOT NULL,
 guest_credential_hash text,
 host_public_key text NOT NULL,
 guest_public_key text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 extension_id uuid,
 extension_by text CHECK (extension_by IN ('host','guest')),
 extension_minutes integer,
 extension_at timestamptz
);
CREATE INDEX temporary_rooms_expiry_idx ON temporary_rooms(expires_at);
CREATE TABLE temporary_room_messages (
 id uuid PRIMARY KEY,
 room_id uuid NOT NULL REFERENCES temporary_rooms(id) ON DELETE CASCADE,
 sender text NOT NULL CHECK (sender IN ('host','guest')),
 ciphertext text NOT NULL CHECK (octet_length(ciphertext) BETWEEN 32 AND 10000000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX temporary_room_messages_room_idx ON temporary_room_messages(room_id,created_at,id);
ALTER TABLE temporary_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_room_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON temporary_rooms,temporary_room_messages FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
   EXECUTE format('REVOKE ALL ON temporary_rooms,temporary_room_messages FROM %I',api_role);
  END IF;
 END LOOP;
END $$;
