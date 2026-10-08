import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, adminAuditLog, users, conversationMembers, realtimeEvents } from "@/db/schema";
import { baseDTO } from "@/server/chat";
import { authorizeAdminMutation, adminActionError, lockAdminActor } from "@/server/admin-authentication";
import { guardSameOrigin, jsonError, readJson } from "@/server/http";
import { isUuid } from "@/server/users";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const blocked = guardSameOrigin(req); if (blocked) return blocked;
  try {
    const me = await authorizeAdminMutation(req, await readJson(req));
    const { id } = await params;
    if (!isUuid(id)) return jsonError(422, "Invalid message.");
    await db.transaction(async (tx) => {
      await lockAdminActor(tx, me.id);
      const [message] = await tx.select().from(messages).where(eq(messages.id, id)).for("update");
      if (!message) throw new Error("NOT_FOUND");
      if (message.deletedAt) return;
      await tx.insert(adminAuditLog).values({ adminId: me.id, action: "message_deleted", targetMessageId: id, details: { actorUserId: me.id, deletedMessageId: id } });
      // Soft deletion preserves attachment metadata for the retention worker.
      const [deleted] = await tx.update(messages).set({ deletedAt: new Date(), text: "", updatedAt: new Date() }).where(eq(messages.id, id)).returning();
      const [sender] = await tx.select().from(users).where(eq(users.id, message.senderId));
      const recipients = await tx.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, message.conversationId));
      if (recipients.length && sender) await tx.insert(realtimeEvents).values(recipients.map(({ userId }) => ({ userId, payload: { type: "message:deleted", conversationId: message.conversationId, message: baseDTO(deleted, sender) } })));
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return adminActionError(error); }
}
