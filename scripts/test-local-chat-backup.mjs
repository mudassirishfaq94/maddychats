import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/** Real local archive + restoration on an unapproved browser; no trust fixture bypass. */
export async function testLocalChatBackup(base, pool, source, owner, password, conversationId) {
  const page = source.page;
  const response = await page.goto(base + "/app/profile#local-chat-backup");
  assert.match(response.headers()["permissions-policy"], /camera=\(self\)/);
  const section = page.locator("#local-chat-backup");
  await section.getByRole("button", { name: "Set up local backup", exact: true }).click();
  const code = await section.getByLabel("Local backup code", { exact: true }).textContent();
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  await section.getByLabel("Enter your saved backup code to check it", { exact: true }).fill(code);
  await section.getByRole("button", { name: "I saved the code · Create backup", exact: true }).click();
  await section.getByRole("status").filter({ hasText: "Backup saved on this device." }).waitFor({ timeout: 90000 });
  const saved = await page.evaluate(async userId => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open(`circlo-backup:${userId}`); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const value = await new Promise((resolve, reject) => { const request = db.transaction("backup").objectStore("backup").get("settings"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    db.close(); return { enabled: value.enabled, extractable: value.key.extractable, savedAt: value.savedAt };
  }, owner.id);
  assert(saved.enabled && saved.savedAt); assert.equal(saved.extractable, false);
  const download = page.waitForEvent("download");
  await section.getByRole("button", { name: "Save backup file", exact: true }).click();
  const file = await download, bytes = await readFile(await file.path());
  assert(file.suggestedFilename().endsWith(".circlo"));
  assert.equal(bytes.includes(Buffer.from("Real encrypted delivery baseline")), false);
  // Pause from a second tab while collection is in flight. Completion must not
  // restore the old enabled settings or replace the previous archive.
  const settingsPage = await page.context().newPage();
  await settingsPage.goto(base + "/app/profile#local-chat-backup");
  const pause = settingsPage.getByRole("button", { name: "Pause daily backup", exact: true });
  await pause.waitFor();
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { arrived = resolve; });
  const detailPath = `**/api/conversations/${conversationId}`;
  await page.route(detailPath, async route => { arrived(); await gate; await route.continue(); });
  try {
    await section.getByRole("button", { name: "Back up now", exact: true }).click();
    await Promise.race([waiting, page.waitForTimeout(15000).then(() => { throw new Error("Backup detail collection did not begin"); })]);
    await pause.click(); await settingsPage.getByRole("button", { name: "Enable daily backup", exact: true }).waitFor();
    release();
    await section.getByRole("status").filter({ hasText: "Daily backup is paused" }).waitFor();
    const current = await page.evaluate(async userId => {
      const db = await new Promise(resolve => { const request = indexedDB.open(`circlo-backup:${userId}`); request.onsuccess = () => resolve(request.result); });
      const value = await new Promise(resolve => { const request = db.transaction("backup").objectStore("backup").get("settings"); request.onsuccess = () => resolve(request.result); });
      db.close(); return { enabled: value.enabled, savedAt: value.savedAt };
    }, owner.id);
    assert.equal(current.enabled, false); assert.equal(current.savedAt, saved.savedAt);
  } finally { release(); await page.unroute(detailPath); await settingsPage.close(); }
  await section.getByRole("button", { name: "Back up now", exact: true }).click();
  await section.getByRole("status").filter({ hasText: "Backup saved on this device." }).waitFor();
  await section.getByRole("button", { name: "Enable daily backup", exact: true }).waitFor();
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  let targetId;
  try {
    const target = await context.newPage();
    await target.goto(base + "/login");
    await target.getByLabel("Email or username", { exact: true }).fill(owner.username);
    await target.getByLabel("Password", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await target.waitForURL("**/app/device-access**");
    await target.getByRole("button", { name: "I don’t have my old device", exact: true }).click();
    await target.getByText("Restore a saved backup instead", { exact: true }).click();
    const restore = target.locator("#local-chat-backup");
    await restore.getByLabel("Circlo backup file", { exact: true }).setInputFiles({ name: "saved.circlo", mimeType: "application/octet-stream", buffer: bytes });
    await restore.getByLabel("Saved backup code", { exact: true }).fill("A".repeat(43));
    await restore.getByRole("checkbox").check();
    await restore.getByRole("button", { name: "Restore my chats", exact: true }).click();
    await restore.getByRole("status").filter({ hasText: "The backup code is incorrect" }).waitFor();
    await restore.getByLabel("Saved backup code", { exact: true }).fill(code);
    await restore.getByRole("button", { name: "Restore my chats", exact: true }).click();
    await restore.getByRole("status").filter({ hasText: "Your saved chats are back on this device." }).waitFor({ timeout: 60000 });
    targetId = await target.evaluate(() => localStorage.getItem("e2ee_device_id"));
    assert.equal((await pool.query("select trusted_at from e2ee_keys where user_id=$1 and device_id=$2", [owner.id, targetId])).rows[0].trusted_at, null, "A backup never auto-approves or revives a device");
    const conversations = await context.request.get(base + "/api/conversations");
    assert.equal(conversations.status(), 401, "Online history stays behind device verification after local restore");
    await target.evaluate(() => { window.dispatchEvent(new Event("maddy:locked-chats")); window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-preference" })); });
    await restore.getByLabel("Choose a saved chat", { exact: true }).selectOption(conversationId);
    await restore.getByText("Real encrypted delivery baseline", { exact: true }).waitFor();
    assert(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Local recovery fits a mobile viewport");
    await target.evaluate(id => { localStorage.setItem("maddy:locked-chats", JSON.stringify([id])); window.dispatchEvent(new Event("maddy:locked-chats")); }, conversationId);
    await restore.getByRole("button", { name: "View imported chats", exact: true }).click();
    assert.equal(await restore.getByLabel("Choose a saved chat", { exact: true }).locator(`option[value="${conversationId}"]`).count(), 0, "Reopening an archive cannot expose a chat locked since its backup");
    assert.equal(await restore.getByText("Real encrypted delivery baseline", { exact: true }).count(), 0);
  } finally {
    await context.close();
    if (targetId) await pool.query("delete from e2ee_keys where user_id=$1 and device_id=$2 and trusted_at is null", [owner.id, targetId]);
  }
  // Exercise the actual browser camera after navigating from another app tab.
  await page.context().grantPermissions(["microphone", "camera"], { origin: base });
  await page.evaluate(() => { const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); if (constraints.video) window.__qrStream = stream; return stream; }; });
  await page.getByRole("button", { name: "Scan QR on your new device", exact: true }).click();
  await page.waitForFunction(() => window.__qrStream?.getVideoTracks().some(track => track.readyState === "live"));
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await page.waitForFunction(() => window.__qrStream.getTracks().every(track => track.readyState === "ended"));
  await page.goto(base + `/app/chats/${conversationId}`);
  console.log("PASS local encrypted archive export, nonextractable device storage, restore without an old phone, unchanged device trust, mobile layout, actual QR camera capture and cleanup");
}
