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
    await page.getByRole("region", { name: "Messages", exact: true }).getByText("Real encrypted delivery baseline", { exact: true }).last().waitFor();
    for (let i = 0; i < 6; i++) {
      const load = page.getByRole("button", { name: /^(Load older messages|Loading…)$/ });
      if (!await load.count()) break;
      const before = await page.locator(".message-history-row").count();
      await page.getByRole("region", { name: "Messages", exact: true }).hover();
      await page.mouse.wheel(0, -50000);
      // Scrolling triggers automatic pagination. Do not race a button that can
      // become disabled or disappear when the final older page arrives.
      await page.waitForFunction(before => document.querySelectorAll(".message-history-row").length > before || !Array.from(document.querySelectorAll("button")).some(button => button.textContent.includes("Load older messages")), before, { timeout: 90000 });
      await page.waitForTimeout(300);
    }
    assert(await page.locator(".message-history-row").count() >= 150, "The long-history typing check loads the seeded older pages");
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
    let stored;
    const deadline = Date.now() + 15000;
    while (!stored && Date.now() < deadline) {
      stored = await page.evaluate(async ({ userId, conversationId, draft }) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(`circlo-outbox:${userId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        const record = await new Promise((resolve, reject) => { const r = db.transaction("messages").objectStore("messages").get(`draft:${conversationId}`); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        if (!record?.ciphertext?.byteLength) return null;
        const key = await new Promise((resolve, reject) => { const r = db.transaction("keys").objectStore("keys").get("device"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv, additionalData: new TextEncoder().encode(`draft:${conversationId}`) }, key, record.ciphertext);
        if (new TextDecoder().decode(bytes) !== draft) return null;
        return { encrypted: true, plain: record.plain, legacy: localStorage.getItem(`ziptalk:draft:${userId}:${conversationId}`) };
      } finally { db.close(); }
      }, { userId: owner.id, conversationId, draft });
      if (!stored) await page.waitForTimeout(100);
    }
    assert(stored, "The complete draft must be durably encrypted within 15 seconds");
    assert.equal(stored.encrypted, true); assert.equal(stored.plain, undefined); assert.equal(stored.legacy, null);
    await page.reload(); await composer.waitFor();
    await page.waitForFunction(text => document.querySelector('textarea[aria-label="Message text"]')?.value === text, draft, { timeout: 15000 });
    assert.equal(await composer.inputValue(), draft);
    // Delay draft decryption deterministically: clearing input while restoration
    // is pending must not resurrect the old draft after it resolves.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("hold-draft-decrypt") !== "1") return;
      sessionStorage.removeItem("hold-draft-decrypt");
      const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
      crypto.subtle.decrypt = async (...args) => {
        const aad = args[0]?.additionalData;
        if (aad && new TextDecoder().decode(aad).startsWith("draft:")) {
          crypto.subtle.decrypt = decrypt; // Delay only this cold restoration.
          window.__draftDecryptHeld = true;
          await new Promise(resolve => setTimeout(resolve, 1500));
          const result = await decrypt(...args);
          window.__draftDecryptReleased = true;
          return result;
        }
        return decrypt(...args);
      };
    });
    await page.evaluate(() => sessionStorage.setItem("hold-draft-decrypt", "1"));
    await page.reload(); await composer.waitFor();
    await page.waitForFunction(() => window.__draftDecryptHeld === true, undefined, { timeout: 60000 });
    await composer.fill("New input while restoration is pending");
    await composer.fill("");
    await page.waitForFunction(() => window.__draftDecryptReleased === true, undefined, { timeout: 60000 });
    await page.waitForTimeout(200);
    assert.equal(await composer.inputValue(), "", "Late restoration never overwrites a user-cleared draft");
    await composer.fill("Rapid navigation draft");
    await page.locator('a[href="/app"]:visible').first().click();
    await page.waitForURL(base + "/app");
    await page.goBack(); await composer.waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message text"]')?.value === "Rapid navigation draft", undefined, { timeout: 60000 });
    // Poll from Node: Playwright waitForFunction treats a returned Promise as
    // truthy, so it cannot prove an asynchronous IndexedDB transaction finished.
    const persistedDraft = () => heldTab.evaluate(async conversationId => {
      const db = window.__heldOutbox;
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction("messages").objectStore("messages").get(`draft:${conversationId}`);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (!record) return null;
      const key = await new Promise((resolve, reject) => {
        const request = db.transaction("keys").objectStore("keys").get("device");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv, additionalData: new TextEncoder().encode(`draft:${conversationId}`) }, key, record.ciphertext);
      return new TextDecoder().decode(bytes);
    }, conversationId);
    const waitForPersistedDraft = async expected => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await persistedDraft() === expected) return;
        await page.waitForTimeout(100);
      }
      assert.fail("Encrypted draft did not reach the expected committed state within 15 seconds");
    };
    await waitForPersistedDraft("Rapid navigation draft");
    // Hold an older encryption task until after clearing. A deletion that is
    // merely queued behind encryption would deadlock this check or resurrect
    // the old draft once the task finishes.
    await page.evaluate(() => {
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      crypto.subtle.encrypt = async (...args) => {
        const aad = args[0]?.additionalData;
        if (aad && new TextDecoder().decode(aad).startsWith("draft:")) {
          crypto.subtle.encrypt = encrypt;
          window.__draftEncryptHeld = true;
          await new Promise(resolve => { window.__releaseDraftEncrypt = resolve; });
          const result = await encrypt(...args);
          window.__draftEncryptReleased = true;
          return result;
        }
        return encrypt(...args);
      };
    });
    await composer.fill("An older encryption task must not resurrect this draft");
    await page.waitForFunction(() => window.__draftEncryptHeld === true, undefined, { timeout: 60000 });
    await composer.fill("");
    await waitForPersistedDraft(null);
    assert.equal(await page.evaluate(() => window.__draftEncryptReleased === true), false);
    await page.evaluate(() => window.__releaseDraftEncrypt());
    await page.waitForFunction(() => window.__draftEncryptReleased === true, undefined, { timeout: 60000 });
    await waitForPersistedDraft(null);
    await page.reload(); await composer.waitFor();
    await page.getByRole("region", { name: "Messages", exact: true }).getByText("Real encrypted delivery baseline", { exact: true }).last().waitFor();
    assert.equal(await composer.inputValue(), "");
    // Cold legacy migration requires no encrypted draft. Retire the current
    // document and prepare only this disposable conversation's draft record.
    await page.goto(base + "/app");
    await heldTab.evaluate(conversationId => new Promise((resolve, reject) => {
      const transaction = window.__heldOutbox.transaction("messages", "readwrite");
      transaction.objectStore("messages").delete(`draft:${conversationId}`);
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    }), conversationId);
    // Install legacy data before the new document mounts, rather than racing
    // the current document's asynchronous restoration/migration.
    await page.addInitScript(({ userId, conversationId }) => {
      if (sessionStorage.getItem("inject-legacy-draft") !== "1") return;
      sessionStorage.removeItem("inject-legacy-draft");
      localStorage.setItem(`ziptalk:draft:${userId}:${conversationId}`, "Legacy draft migration");
    }, { userId: owner.id, conversationId });
    await page.evaluate(() => sessionStorage.setItem("inject-legacy-draft", "1"));
    await page.goto(base + "/app/chats/" + conversationId); await composer.waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message text"]')?.value === "Legacy draft migration", undefined, { timeout: 60000 });
    await page.waitForFunction(({ userId, conversationId }) => localStorage.getItem(`ziptalk:draft:${userId}:${conversationId}`) === null, { userId: owner.id, conversationId }, { timeout: 60000 });
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
    await page.evaluate(() => window.__releaseDraftEncrypt?.()).catch(() => {});
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
