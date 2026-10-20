import assert from "node:assert/strict";

/** Two real fixture browsers verify privacy at both the transport and history layers. */
export async function testChatPresence(base, conversationId, owner, peer, source, recipient, pool) {
  const privacy = async (device, patch) => {
    const response = await device.page.request.put(base + "/api/privacy/settings", { headers: { Origin: base }, data: patch });
    assert.equal(response.status(), 200);
  };
  const typing = async value => {
    const response = await source.page.request.post(base + `/api/conversations/${conversationId}/typing`, { headers: { Origin: base }, data: { typing: value } });
    assert.equal(response.status(), 200);
  };
  const indicator = recipient.page.getByText(`${owner.displayName ?? owner.username} is typing`, { exact: true });
  await privacy(source, { typingIndicators: false });
  await typing(true);
  await recipient.page.waitForTimeout(350);
  assert.equal(await indicator.count(), 0, "Disabled typing is not broadcast");
  await privacy(source, { typingIndicators: true });
  const composer = source.page.getByRole("textbox", { name: "Message text" });
  await composer.fill("Typing indicator browser test");
  await indicator.waitFor();
  await composer.fill("");
  await indicator.waitFor({ state: "hidden" });
  await typing(true);
  await indicator.waitFor();
  await typing(false);
  await indicator.waitFor({ state: "hidden" });
  await typing(true);
  await indicator.waitFor();
  await indicator.waitFor({ state: "hidden", timeout: 7000 });

  await pool.query("insert into realtime_events(user_id,payload) values($1,$2::jsonb)", [peer.id, JSON.stringify({ type: "typing:update", conversationId, userId: owner.id, typing: true, expiresAt: new Date(Date.now() - 10000).toISOString() })]);
  await recipient.page.waitForTimeout(350);
  assert.equal(await indicator.count(), 0, "Expired typing replay must not appear");

  // Keep unread bookkeeping while withholding read identities from other members.
  await privacy(recipient, { readReceipts: false });
  const message = (await pool.query("insert into messages(conversation_id,sender_id,text) values($1,$2,$3) returning id", [conversationId, owner.id, "Private receipt fixture"])).rows[0];
  try {
    const read = await recipient.page.request.post(base + `/api/conversations/${conversationId}/read`, { headers: { Origin: base } });
    assert.equal(read.status(), 200);
    assert.equal((await pool.query("select count(*)::int as n from message_reads where message_id=$1 and user_id=$2", [message.id, peer.id])).rows[0].n, 1);
    const leaked = await pool.query("select count(*)::int as n from realtime_events where user_id=$1 and payload->>'type'='message:read' and payload->'messageIds' @> $2::jsonb", [owner.id, JSON.stringify([message.id])]);
    assert.equal(leaked.rows[0].n, 0, "Disabled receipts do not leak via realtime");
    const history = async () => {
      const response = await source.page.request.get(base + `/api/conversations/${conversationId}/messages`);
      assert.equal(response.status(), 200);
      const body = await response.json();
      return body.messages.find(item => item.id === message.id);
    };
    assert.deepEqual((await history()).readBy, [], "Disabled receipts cannot leak through history");
    await privacy(recipient, { readReceipts: true });
    assert((await history()).readBy.some(read => read.userId === peer.id), "Enabled receipts remain functional");
  } finally {
    await pool.query("delete from messages where id=$1", [message.id]);
    await privacy(source, { typingIndicators: true });
    await privacy(recipient, { readReceipts: true });
  }
}
