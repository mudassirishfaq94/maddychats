-- Add forwarded column to messages table
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "forwarded" boolean DEFAULT false NOT NULL;
