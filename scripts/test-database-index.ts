/** Screen DTO equality and rollback, restricted to an existing disposable local DB. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { execFileSync } from "node:child_process";

async function main() {
  const url = process.env.DATABASE_INDEX_TEST_URL;
  assert(url && new URL(url).hostname === "127.0.0.1" && new URL(url).pathname.endsWith("_test"));
  process.env.DATABASE_URL = url;
  const sql = new Pool({ connectionString: url });
  const { pool } = await import("../src/db");
  const chat = await import("../src/server/chat");
  const status = await import("../src/server/status");
  const privacy = await import("../src/server/privacy");
  const notifications = await import("../src/server/notifications");
  const users = await import("../src/server/users");
  const ids: string[] = [];
  let conversation: string | undefined;
  const migrate = (direction: string) => execFileSync(process.execPath, ["scripts/migrate-online-index.mjs", direction], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  try {
    const tag = "indexqa_" + randomUUID().replaceAll("-", "");
    for (const suffix of ["a", "b"]) ids.push((await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,'not-a-password',now()) returning id", [tag + suffix, tag + suffix + "@example.invalid"])).rows[0].id);
    conversation = (await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [ids[0]])).rows[0].id;
    await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation, ...ids]);
    const message = (await sql.query("insert into messages(conversation_id,sender_id,text,encrypted) values($1,$2,'opaque test ciphertext',true) returning id", [conversation, ids[1]])).rows[0].id;
    await sql.query("insert into message_stars(message_id,user_id) values($1,$2)", [message, ids[0]]);
    await status.createStatus({ userId: ids[1], type: "text", text: "Selected status", privacy: "selected", selectedUserIds: [ids[0]] });
    await sql.query("insert into notifications(user_id,type,data) values($1,'message','{}')", [ids[0]]);
    const snapshot = async () => ({
      chats: await chat.listConversationsFor(ids[0]),
      detail: await chat.getConversationForUser(conversation!, ids[0]),
      messages: await chat.listMessages(conversation!, null, 50, ids[0]),
      starred: await chat.listStarredMessages(ids[0]),
      pins: await chat.listPinnedMessages(conversation!, ids[0]),
      media: await chat.listConversationMedia(conversation!, ids[0]),
      files: await chat.listConversationFiles(conversation!, ids[0]),
      links: await chat.listConversationLinks(conversation!, ids[0]),
      status: await status.listVisibleStatuses(ids[0]),
      notifications: await notifications.listNotifications(ids[0]),
      privacy: await privacy.getPrivacySettings(ids[0]),
      profile: users.toSafeUser((await users.findUserById(ids[0]))!),
    });
    migrate("down");
    const before = await snapshot();
    assert(before.messages.messages.length === 1 && before.messages.messages[0].encrypted);
    assert(before.status.some(row => row.text === "Selected status"));
    migrate("up");
    assert.deepEqual(await snapshot(), before);
    migrate("down");
    assert.deepEqual(await snapshot(), before);
    migrate("up");
    console.log("12 screen DTO collections unchanged; selected-status privacy, ciphertext, migration and rollback verified.");
  } finally {
    if (conversation) await sql.query("delete from conversations where id=$1 and created_by_id=$2", [conversation, ids[0]]);
    for (const id of ids) await sql.query("delete from users where id=$1 and username like 'indexqa_%'", [id]);
    await sql.end(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
