-- Scheduled messages
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  sent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_messages_sender_idx ON scheduled_messages(sender_id);
CREATE INDEX IF NOT EXISTS scheduled_messages_conv_idx ON scheduled_messages(conversation_id);
CREATE INDEX IF NOT EXISTS scheduled_messages_scheduled_idx ON scheduled_messages(scheduled_for);
CREATE INDEX IF NOT EXISTS scheduled_messages_sent_idx ON scheduled_messages(sent);
