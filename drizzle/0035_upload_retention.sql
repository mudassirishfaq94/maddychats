CREATE TABLE "stored_uploads" (
  "path" text PRIMARY KEY,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "stored_uploads_created_idx" ON "stored_uploads" ("created_at");
ALTER TABLE "stored_uploads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "stored_uploads" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'REVOKE ALL ON stored_uploads FROM anon'; END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'REVOKE ALL ON stored_uploads FROM authenticated'; END IF;
END $$;
-- Inventory existing metadata only; never assume arbitrary disk objects are disposable.
INSERT INTO stored_uploads(path, created_at)
SELECT path, min(created_at) FROM message_attachments GROUP BY path ON CONFLICT DO NOTHING;
INSERT INTO stored_uploads(path, created_at)
SELECT media_path, min(created_at) FROM statuses WHERE media_path IS NOT NULL GROUP BY media_path ON CONFLICT DO NOTHING;
INSERT INTO stored_uploads(path)
SELECT 'avatars/' || substring(avatar_url from '^/api/media/avatars/([a-zA-Z0-9.-]+)$')
FROM users WHERE avatar_url ~ '^/api/media/avatars/[a-zA-Z0-9.-]+$' ON CONFLICT DO NOTHING;
INSERT INTO stored_uploads(path)
SELECT 'avatars/' || substring(avatar_url from '^/api/media/avatars/([a-zA-Z0-9.-]+)$')
FROM conversations WHERE avatar_url ~ '^/api/media/avatars/[a-zA-Z0-9.-]+$' ON CONFLICT DO NOTHING;
