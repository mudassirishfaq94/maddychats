-- Online migration: run statements separately, OUTSIDE a transaction.
-- Query: src/server/chat.ts markDeliveredFor (realtime connection).
-- Equality JOIN on conversation_id, WHERE sender_id <> user AND delivered_at IS NULL.
-- Only pending deliveries are indexed; delivered-message history adds no entries.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '30min';
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_undelivered_conversation_idx
  ON public.messages (conversation_id, sender_id)
  WHERE delivered_at IS NULL;
