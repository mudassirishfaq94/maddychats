-- Enable trigram extension for LIKE/ILIKE performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes for fast case-insensitive substring search
-- These dramatically speed up ilike('%query%') on display_name and username
CREATE INDEX IF NOT EXISTS "users_display_name_trgm_idx"
  ON "users" USING gin ("display_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "users_username_trgm_idx"
  ON "users" USING gin ("username" gin_trgm_ops);
