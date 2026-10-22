import { sql } from "drizzle-orm";
import { messages } from "@/db/schema";

/** Apply to queries whose outer row is messages. Values remain SQL parameters.
 * Deletion/expiry tombstones are rendered by the caller; per-user hidden rows
 * and conversations the viewer no longer belongs to must not be returned.
 */
export function messageVisibleTo(viewerId: string | ReturnType<typeof sql.placeholder>) {
  return sql`exists (
    select 1 from conversation_members visibility_member
    join conversations visibility_conversation on visibility_conversation.id=visibility_member.conversation_id
    where visibility_member.conversation_id=${messages.conversationId}
      and visibility_member.user_id=${viewerId}
      and visibility_conversation.deleted_at is null
      and (visibility_member.cleared_at is null or ${messages.createdAt}>visibility_member.cleared_at)
  ) and not exists (
    select 1 from message_deletions visibility_deletion
    where visibility_deletion.message_id=${messages.id} and visibility_deletion.user_id=${viewerId}
  )`;
}
