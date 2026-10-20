import { config } from "dotenv";
config({ path: ".env" });

async function main() {
  const { db } = await import("../src/db");
  const { e2eeConversationKeys, conversations, conversationMembers, messages, messageAttachments } = await import("../src/db/schema");
  const { desc, eq, inArray } = await import("drizzle-orm");

  const convos = await db.select().from(conversations).orderBy(desc(conversations.createdAt)).limit(5);
  console.log("recent conversations:", convos.length);
  for (const c of convos) {
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, c.id));
    const keys = await db
      .select()
      .from(e2eeConversationKeys)
      .where(eq(e2eeConversationKeys.conversationId, c.id))
      .orderBy(desc(e2eeConversationKeys.keyVersion));
    const msgs = await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, c.id));
    const msgIds = msgs.map((m) => m.id);
    let encMedia = 0;
    let missingKey = 0;
    if (msgIds.length) {
      const atts = await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, msgIds));
      encMedia = atts.filter((a) => a.encrypted).length;
      missingKey = atts.filter((a) => a.encrypted && !a.encKey).length;
    }
    console.log(
      `conv ${c.id.slice(0, 8)} members=${members.length} keyRows=${keys.length}` +
        ` versions=[${keys.map((k) => `v${k.keyVersion}${k.isActive ? "*" : ""}dev=${k.deviceId.slice(0, 6)}for=${k.userId.slice(0, 6)}`).join(",")}]` +
        ` encMedia=${encMedia} noKey=${missingKey}`,
    );
  }

  const allEnc = await db.select().from(messageAttachments).where(eq(messageAttachments.encrypted, true));
  console.log("\ntotal encrypted attachments:", allEnc.length);
  const noKey = allEnc.filter((a) => !a.encKey);
  console.log("encrypted attachments with NULL encKey (cannot ever decrypt):", noKey.length);
  if (noKey.length) {
    console.log("  sample:", noKey.slice(0, 3).map((a) => ({ id: a.id.slice(0, 8), name: a.originalName, msg: a.messageId.slice(0, 8) })));
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
