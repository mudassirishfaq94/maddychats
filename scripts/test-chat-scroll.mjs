import assert from "node:assert/strict";

/** Actual unread encrypted history, restricted to disposable owned conversations. */
export async function testChatScroll(base, source, recipient, pool, conversationId) {
  const owner = (await pool.query("select u.id,u.username from conversations c join users u on u.id=c.created_by_id where c.id=$1", [conversationId])).rows[0];
  assert(/^(viewer_|restored_|releaseqa_perf_)/.test(owner?.username ?? ""));
  const identity = await recipient.page.request.get(base + "/api/auth/me");
  assert.equal(identity.status(), 200);
  const { user: peer } = await identity.json();
  assert(/^(viewer_|restored_|releaseqa_perf_)/.test(peer.username));
  assert.notEqual(peer.id, owner.id);
  assert.equal((await pool.query("select user_id from conversation_members where conversation_id=$1 and user_id=$2", [conversationId, peer.id])).rowCount, 1);
  const input = source.page.getByRole("textbox", { name: "Message text", exact: true });
  await input.fill("A longer encrypted message that wraps on mobile and changes the history height. ".repeat(20));
  const response = source.page.waitForResponse(r => r.url().endsWith(`/api/conversations/${conversationId}/messages`) && r.request().method() === "POST");
  await input.press("Enter"); const accepted = await response; assert.equal(accepted.status(), 201);
  const packet = await accepted.json();
  await source.page.goto(base + "/app/chats");
  const fixtureIds = [packet.message.id];
  const page = source.page, previous = page.viewportSize();
  try {
    // Controlled unread display fixtures reuse real conversation ciphertext.
    // API sending/peer verification remains enforced and is tested separately.
    fixtureIds.push(...(await pool.query("insert into messages(conversation_id,sender_id,text,type,encrypted,created_at) select conversation_id,$2,text,type,encrypted,now()-interval '3 minutes'+n*interval '1 second' from messages cross join generate_series(1,125) n where id=$1 returning id", [packet.message.id, peer.id])).rows.map(row => row.id));
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
    // Native touch events: an upward flick at the bottom must keep following;
    // dragging toward older messages must release it.
    const touchPoints = await page.evaluate(() => navigator.maxTouchPoints);
    const touch = await page.context().newCDPSession(page);
    try {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      const gesture = async delta => {
        const box = await page.getByRole("region", { name: "Messages", exact: true }).boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        for (let step = 1; step <= 6; step++) {
          await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + delta * step / 6 }] });
          await page.waitForTimeout(35);
        }
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(500);
      };
      await gesture(-150);
      await page.setViewportSize({ width: 390, height: 740 }); await latest();
      await gesture(150);
      await page.waitForFunction(() => { const n = document.querySelector('[aria-label="Messages"]'); return n.scrollHeight - n.scrollTop - n.clientHeight > 80; });
      await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(400);
      assert(await page.getByRole("region", { name: "Messages", exact: true }).evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 80));
      await page.getByRole("button", { name: "Scroll to latest messages", exact: true }).click(); await latest();
    } finally {
      await touch.send("Emulation.setTouchEmulationEnabled", { enabled: touchPoints > 0, maxTouchPoints: Math.max(1, touchPoints) }); await touch.detach();
    }
    // Intentional older-history scrolling must survive subsequent layout changes.
    const viewport = page.getByRole("region", { name: "Messages", exact: true });
    await viewport.hover(); await page.mouse.wheel(0, -900);
    await page.waitForFunction(() => { const n = document.querySelector('[aria-label="Messages"]'); return n.scrollHeight - n.scrollTop - n.clientHeight > 200; });
    await page.setViewportSize({ width: 320, height: 740 }); await page.waitForTimeout(800);
    assert(await viewport.evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 200), "Reading older messages is not overridden by resizing");
    await page.getByRole("button", { name: "Scroll to latest messages", exact: true }).click(); await latest();
    await page.setViewportSize({ width: 390, height: 844 }); await latest();
    const older = page.waitForResponse(r => r.url().includes(`/api/conversations/${conversationId}/messages?cursor=`));
    await viewport.hover(); await page.mouse.wheel(0, -50000);
    assert.equal((await older).status(), 200);
    await page.waitForTimeout(800);
    assert(await viewport.evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 200), "Loading an older page preserves the reading position");
    for (let pageNumber=0;pageNumber<4 && await page.locator('[data-virtualized="true"]').count()===0;pageNumber++) {
      const nextPage=page.waitForResponse(r=>r.url().includes(`/api/conversations/${conversationId}/messages?cursor=`));
      await viewport.hover();await page.mouse.wheel(0,-50000);
      assert.equal((await nextPage).status(),200);await page.waitForTimeout(300);
    }
    assert.equal(await page.locator('[data-virtualized="true"]').count(),1,"Real encrypted history must switch to a bounded measured window");
    assert(await viewport.locator('[data-message-id]').count()<60,"Loading older encrypted history must not mount every message row");
    await page.goto(base + "/app/chats/" + conversationId + "?message=" + fixtureIds[fixtureIds.length - 10]);
    await page.waitForTimeout(1500);
    assert(await viewport.evaluate(n => n.scrollHeight - n.scrollTop - n.clientHeight > 200), "Explicit older-message links keep their target");
  } finally {
    await pool.query("delete from messages where id=any($1::uuid[]) and conversation_id=$2", [fixtureIds, conversationId]);
    await page.setViewportSize(previous); await page.goto(base + "/app/chats/" + conversationId);
  }
}
