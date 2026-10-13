import assert from "node:assert/strict";
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";

export async function testDeviceRecoveryUI(base, pool) {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Recovery UI tests require a local fake database");
  const browser = await chromium.launch();
  const username = "recovery_ui_" + randomBytes(6).toString("hex"), password = "Aa1" + randomBytes(24).toString("hex");
  const user = (await pool.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id", [username, username + "@example.invalid", await bcrypt.hash(password, 12)])).rows[0];
  const errors = [];
  const login = async context => {
    const response = await context.request.post(base + "/api/auth/login", { data: { identifier: username, password }, headers: { Origin: base } });
    assert.equal(response.status(), 200);
  };
  const open = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    await login(context); const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/app/profile"); await page.getByLabel("This device fingerprint").waitFor();
    return { context, page };
  };
  try {
    const source = await open(); await source.page.getByText("This device: Trusted", { exact: true }).waitFor();
    await source.page.getByText("Name this browser and set its country", { exact: true }).click();
    await source.page.getByLabel("Device name", { exact: true }).fill("My trusted laptop");
    await source.page.getByLabel("Country (provided by you)").selectOption("AE");
    await source.page.getByRole("button", { name: "Save device details", exact: true }).click();
    await source.page.getByText("Device details saved. Encryption approval is unchanged.", { exact: true }).waitFor();
    assert((await source.page.locator("#encryption-devices").innerText()).includes("United Arab Emirates"));
    const target = await open(); await target.page.getByText("This device: Waiting for approval", { exact: true }).waitFor();
    await source.page.getByRole("button", { name: "Refresh encryption devices", exact: true }).click();
    await source.page.getByRole("button", { name: "Generate linking code", exact: true }).click();
    const code = await source.page.getByLabel("Device linking code", { exact: true }).innerText();
    const pendingDevice = (await pool.query("select device_id from e2ee_keys where user_id=$1 and trusted_at is null order by created_at desc limit 1", [user.id])).rows[0];
    const wrongBrowser = await source.context.request.post(base + "/api/e2ee/devices/link/verify", { data: { deviceId: pendingDevice.device_id, code }, headers: { Origin: base } });
    assert.equal(wrongBrowser.status(), 403, "A code cannot bind the target's key to another browser session");
    await target.page.getByLabel("Device linking code", { exact: true }).fill(code);
    await target.page.getByRole("button", { name: "Link this device", exact: true }).click();
    await target.page.getByText("This device: Trusted", { exact: true }).waitFor({ timeout: 30000 });
    const device = (await pool.query("select device_id from e2ee_keys where user_id=$1 order by created_at desc limit 1", [user.id])).rows[0];
    const reused = await target.context.request.post(base + "/api/e2ee/devices/link/verify", { data: { deviceId: device.device_id, code }, headers: { Origin: base } });
    assert.equal(reused.status(), 403, "A linking code cannot be replayed");
    assert.equal((await target.context.request.post(base + "/api/auth/logout", { headers: { Origin: base } })).status(), 200);
    assert.equal((await target.context.request.get(base + "/api/auth/me")).status(), 401);
    assert.equal((await source.context.request.get(base + "/api/auth/me")).status(), 200, "Signing out another browser keeps this session active");
    await login(target.context); await target.page.reload();
    await target.page.getByText("This device: Trusted", { exact: true }).waitFor({ timeout: 30000 });
    const downloadEvent = source.page.waitForEvent("download");
    await source.page.getByRole("button", { name: "Download encrypted recovery file", exact: true }).click();
    const file = await readFile(await (await downloadEvent).path());
    const recoveryCode = await source.page.locator('code[aria-label="Recovery file code"]').innerText();
    const sourceFingerprint = await source.page.getByLabel("This device fingerprint").innerText();
    await source.context.close();
    const restored = await open();
    await restored.page.getByText("Restore a recovery file or move from the old website", { exact: true }).click();
    await restored.page.getByLabel("Encrypted recovery file", { exact: true }).setInputFiles({ name: "recovery.json", mimeType: "application/json", buffer: file });
    await restored.page.locator('input[type="password"]').last().fill(recoveryCode);
    await restored.page.getByRole("checkbox", { name: /I saved a recovery file/ }).check();
    await restored.page.getByRole("button", { name: "Restore encryption identity", exact: true }).click();
    await restored.page.getByText("This device: Trusted", { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await restored.page.getByLabel("This device fingerprint").innerText(), sourceFingerprint);
    assert.equal((await pool.query("select count(*)::int as n from e2ee_keys where user_id=$1 and trusted_at is not null", [user.id])).rows[0].n, 2, "Recovery preserves the other browser's trust");
    assert.equal(await restored.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, "Mobile recovery page fits the viewport");
    assert.deepEqual(errors, []);
    console.log("PASS mobile device labels/country, code linking/replay, isolated logout, persistent trust and encrypted file restoration");
  } finally { await browser.close(); await pool.query("delete from users where id=$1", [user.id]); }
}
