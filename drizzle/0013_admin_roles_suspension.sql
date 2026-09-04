-- Admin/moderator roles and user suspension
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for finding suspended users
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_suspended_idx ON users(suspended_at) WHERE suspended_at IS NOT NULL;

-- Make the hardcoded admin an admin in the database
UPDATE users SET role = 'admin' WHERE email = 'mudassarmalak090@gmail.com';
