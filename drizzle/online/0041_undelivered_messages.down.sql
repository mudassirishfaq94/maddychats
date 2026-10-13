-- Reverses only the new non-unique performance index. No data is changed.
SET lock_timeout = '5s';
--> statement-breakpoint
SET statement_timeout = '30min';
--> statement-breakpoint
DROP INDEX CONCURRENTLY IF EXISTS public.messages_undelivered_conversation_idx;
