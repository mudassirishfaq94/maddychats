import assert from "node:assert/strict";

/** Uses only the caller's owned conversation and removes the seeded history. */
export async function testMobilePerformance(base, pool, source, owner, conversationId) {
  assert(/^(restored_|releaseqa_wf_)/.test(owner.username), "Only disposable fixture accounts may run the mobile stress test");
  const page = source.page;
  const ids = (await pool.query("insert into messages(conversation_id,sender_id,text,type,encrypted,created_at) select m.conversation_id,m.sender_id,m.text,m.type,m.encrypted,now()-n*interval '1 minute' from messages m cross join generate_series(1,150) n where m.id=(select id from messages where conversation_id=$1 order by created_at limit 1) returning id", [conversationId])).rows.map(row => row.id);
  assert.equal(ids.length, 150);
  const composer = page.getByRole("textbox", { name: "Message text" });
  let cdp;
  const heldTab = await page.context().newPage();
  try {
    await heldTab.goto(base + "/api/app-version");
    await heldTab.evaluate(async userId => {
      window.__heldOutbox = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`circlo-outbox:${userId}`);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
    }, owner.id);
    await page.bringToFront();
    await page.reload(); await composer.waitFor();
    for (let i = 0; i < 6; i++) {
      const load = page.getByRole("button", { name: "Load older messages", exact: true });
      if (!await load.count()) break;
      await load.click(); await page.waitForTimeout(300);
    }
    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 740 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Chat overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 740, height: 360 });
    const composerBox = await composer.boundingBox();
    assert(composerBox && composerBox.y >= 0 && composerBox.y + composerBox.height <= 360, "Composer remains visible in short landscape");
    await page.setViewportSize({ width: 360, height: 740 });
    cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const draft = "Mobile typing must remain complete with no lost characters with no lost characters ";
    await composer.pressSequentially(draft, { delay: 35, timeout: 90000 });
    assert.equal(await composer.inputValue(), draft);
    await page.waitForFunction(async ({ userId, conversationId }) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(`circlo-outbox:${userId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        const record = await new Promise((resolve, reject) => { const r = db.transaction("messages").objectStore("messages").get(`draft:${conversationId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        return record?.ciphertext instanceof ArrayBuffer && record.ciphertext.byteLength > 0;
      } finally { db.close(); }
    }, { userId: owner.id, conversationId }, { timeout: 15000 });
    const stored = await page.evaluate(async ({ userId, conversationId }) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(`circlo-outbox:${userId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const record = await new Promise((resolve, reject) => { const r = db.transaction("messages").objectStore("messages").get(`draft:${conversationId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      db.close();
      return { encrypted: record?.ciphertext instanceof ArrayBuffer && record.ciphertext.byteLength > 0, plain: record?.plain, legacy: localStorage.getItem(`ziptalk:draft:${userId}:${conversationId}`) };
    }, { userId: owner.id, conversationId });
    assert.equal(stored.encrypted, true); assert.equal(stored.plain, undefined); assert.equal(stored.legacy, null);
    await page.reload(); await composer.waitFor();
    await page.waitForFunction(text => document.querySelector('textarea[aria-label="Message text"]')?.value === text, draft, { timeout: 15000 });
    assert.equal(await composer.inputValue(), draft);
    await composer.fill("Rapid navigation draft");
    await page.locator('a[href="/app"]:visible').first().click();
    await page.waitForURL(base + "/app");
    await page.goBack(); await composer.waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message text"]')?.value === "Rapid navigation draft");
    await composer.fill(""); await page.waitForTimeout(800);
    await page.reload(); await composer.waitFor(); await page.waitForTimeout(500);
    assert.equal(await composer.inputValue(), "");
    await page.evaluate(({ userId, conversationId }) => localStorage.setItem(`ziptalk:draft:${userId}:${conversationId}`, "Legacy draft migration"), { userId: owner.id, conversationId });
    await page.reload(); await composer.waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message text"]')?.value === "Legacy draft migration");
    await page.waitForFunction(({ userId, conversationId }) => localStorage.getItem(`ziptalk:draft:${userId}:${conversationId}`) === null, { userId: owner.id, conversationId });
    await composer.fill(""); await page.waitForTimeout(800);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    for (const route of ["/app/profile", "/app/status", "/app/chats", "/app/settings", "/app/people", "/app/communities", "/app/starred"]) {
      await page.goto(base + route);
      for (const width of [320, 360, 390, 412]) {
        await page.setViewportSize({ width, height: 740 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} overflow at ${width}px`);
      }
    }
    return { mobileWidths: [320, 360, 390, 412], encryptedDraftReload: true, longHistoryTyping: true };
  } finally {
    await heldTab.close();
    if (cdp) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {});
    await pool.query("delete from messages where id=any($1::uuid[]) and conversation_id=$2", [ids, conversationId]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/app/chats/" + conversationId);
    // Hard reload stress is a separate fixture workload from approval tests.
    // Reset only this disposable user's registration bucket; production limits stay enforced.
    await pool.query("delete from rate_limit_buckets where key=$1", [`device-registration:${owner.id}`]);
  }
}
