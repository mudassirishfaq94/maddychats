-- Communities and channels
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'text',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(community_id, name)
);

CREATE INDEX IF NOT EXISTS communities_created_by_idx ON communities(created_by);
CREATE INDEX IF NOT EXISTS community_members_user_idx ON community_members(user_id);
CREATE INDEX IF NOT EXISTS community_members_comm_idx ON community_members(community_id);
CREATE INDEX IF NOT EXISTS channels_community_idx ON channels(community_id);

-- Voice message transcripts
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS transcript TEXT;

-- End-to-end encryption
CREATE TABLE IF NOT EXISTS e2ee_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS e2ee_conversation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, user_id, device_id)
);

CREATE INDEX IF NOT EXISTS e2ee_keys_user_idx ON e2ee_keys(user_id);
CREATE INDEX IF NOT EXISTS e2ee_conv_keys_conv_idx ON e2ee_conversation_keys(conversation_id);
CREATE INDEX IF NOT EXISTS e2ee_conv_keys_user_idx ON e2ee_conversation_keys(user_id);
