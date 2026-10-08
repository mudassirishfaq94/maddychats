import { sql } from "drizzle-orm";
import { db } from "@/db";
import { deleteStoredStrict } from "./storage";

/** Only tracked, unreferenced objects older than 24 hours are removed. */
export async function cleanupUploads() {
  return db.transaction(async (tx) => {
    const candidates = await tx.execute<{ path: string }>(sql`
      SELECT u.path FROM stored_uploads u
      WHERE u.created_at < now() - interval '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM message_attachments a JOIN messages m ON m.id=a.message_id
          JOIN conversations c ON c.id=m.conversation_id
          WHERE a.path=u.path AND m.deleted_at IS NULL AND c.deleted_at IS NULL
          AND (m.expires_at IS NULL OR m.expires_at > now())
        )
        AND NOT EXISTS (SELECT 1 FROM statuses s WHERE s.media_path=u.path AND s.expires_at > now())
        AND NOT EXISTS (SELECT 1 FROM users p WHERE p.avatar_url='/api/media/' || u.path)
        AND NOT EXISTS (SELECT 1 FROM conversations c WHERE c.avatar_url='/api/media/' || u.path AND c.deleted_at IS NULL)
      ORDER BY u.created_at LIMIT 20 FOR UPDATE OF u SKIP LOCKED
    `);
    let removed = 0; let failed = 0;
    for (const { path } of candidates.rows) {
      try {
        await deleteStoredStrict(path);
        await tx.execute(sql`DELETE FROM message_attachments WHERE path=${path}`);
        await tx.execute(sql`DELETE FROM stored_uploads WHERE path=${path}`);
        removed++;
      } catch { failed++; }
    }
    // Expired status rows must stay until their storage deletion succeeded.
    await tx.execute(sql`DELETE FROM statuses s WHERE s.expires_at < now() - interval '24 hours'
      AND (s.media_path IS NULL OR NOT EXISTS (SELECT 1 FROM stored_uploads u WHERE u.path=s.media_path))`);
    return { removed, failed };
  });
}
