ALTER TABLE privacy_settings ADD COLUMN last_seen_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE privacy_settings ADD CONSTRAINT last_seen_contacts_array CHECK (jsonb_typeof(last_seen_contacts) = 'array');
