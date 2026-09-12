ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" uuid;
CREATE INDEX IF NOT EXISTS "messages_sender_created_idx"
  ON "messages" USING btree ("sender_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "messages_sender_client_id_unique"
  ON "messages" USING btree ("sender_id", "client_message_id");
