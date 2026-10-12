import assert from "node:assert/strict";

/** Actual unread encrypted history, restricted to disposable owned conversations. */
export async function testChatScroll(base, source, recipient, pool, conversationId) {
  const owner = (await pool.query("select u.id,u.username from conversations c join users u on u.id=c.created_by_id where c.id=$1", [conversationId])).rows[0];
  assert(/^(viewer_|restored_|releaseqa_perf_)/.test(owner?.username ?? ""));
  await source.page.goto(base + "/app/chats");
  const peerInput = recipient.page.getByRole("textbox", { name: "Message text", exact: true });
  await peerInput.fill("A longer encrypted message that wraps on mobile and changes the history height. ".repeat(20));
  const response = recipient.page.waitForResponse(r => r.url().endsWith(`/api/conversations/${conversationId}/messages`) && r.request().method() === "POST" && r.status() === 201);
  await peerInput.press("Enter"); const packet = await (await response).json();
  const fixtureIds = [packet.message.id];
  const page = source.page, previous = page.viewportSize();
  try {
    fixtureIds.push(...(await pool.query("insert into messages(conversation_id,sender_id,text,type,encrypted,created_at) select conversation_id,sender_id,text,type,encrypted,now()-interval '1 minute'+n*interval '1 second' from messages cross join generate_series(1,20) n where id=$1 returning id", [packet.message.id])).rows.map(row => row.id));
    await page.addInitScript(() => {
      if (sessionStorage.getItem("delay-chat-decrypt") !== "1") return;
      sessionStorage.removeItem("delay-chat-decrypt");
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      crypto.subtle.decrypt = async (...args) => { await new Promise(resolve => setTimeout(resolve, 700)); return decrypt(...args); };
    });
    const latest = async () => {
      await page.waitForFunction(() => { const node = document.querySelector('[aria-label="Messages"]'); return node && node.scrollHeight - node.scrollTop - node.clientHeight <= 2; });
    };
    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport);
      await page.goto(base + "/app/chats/" + conversationId); await latest();
      await page.waitForTimeout(800); await latest();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/app/chats");
    await pool.query("delete from message_reads where message_id=any($1::uuid[]) and user_id=$2", [fixtureIds, owner.id]);
    await page.evaluate(() => sessionStorage.setItem("delay-chat-decrypt", "1"));
    await page.goto(base + "/app/chats/" + conversationId); await latest();
    await page.getByRole("separator", { name: /unread messages/ }).waitFor();
    await page.waitForTimeout(3500); await latest();
    // Intentional older-history scrolling must survive subsequent layout changes.
    const viewport = page.getByRole("region", { name: "Messages", exact: true });
    await viewport.hover(); await page.mouse.wheel(0, -900);
    await page.waitForFunction(() => { const n = document.querySelector('[aria-label="Messages"]'); return n.scrollHeight - n.scrollTop - n.clientHeight > 200; });
    await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(800);
    assert(await viewport.evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 200), "Reading older messages is not overridden by resizing");
    await page.getByRole("button", { name: "Scroll to latest messages", exact: true }).click(); await latest();
    await page.setViewportSize({ width: 390, height: 844 }); await latest();
    await page.goto(base + "/app/chats/" + conversationId + "?message=" + fixtureIds[8]);
    await page.waitForTimeout(1500);
    assert(await viewport.evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 200), "Explicit older-message links keep their target");
  } finally {
    await pool.query("delete from messages where id=any($1::uuid[]) and conversation_id=$2", [fixtureIds, conversationId]);
    await page.setViewportSize(previous); await page.goto(base + "/app/chats/" + conversationId);
  }
}
