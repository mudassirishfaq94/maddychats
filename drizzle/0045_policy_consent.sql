ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS policy_version text;
