import assert from "node:assert/strict";

/** Real React effects/UI with a fake exact-origin Android port; no provider tokens or OS claims. */
export async function testNativeNotificationState(context, base, userId) {
  const preferences = { messageNotifications: true, groupNotifications: true, pushNotifications: true, notificationSound: true, showNotificationDetails: true };
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  let failedRead = false, failedEnrollment = false, failedReads = 0, registrations = 0, registered = false;
  await page.addInitScript(({ userId }) => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Android ZipTalkAndroid/0.8" });
    const state = window.nativeNotificationTest = { bound: userId, clears: 0, permission: localStorage.getItem("qa:notification-permission") === "granted" };
    window.CircloPush = { onmessage: null, postMessage(raw) {
      const request = JSON.parse(raw), reply = { id: request.id };
      if (request.command === "bind") state.bound = request.userId;
      if (request.command === "reconcile" && state.bound && state.bound !== request.userId) { state.bound = null; state.clears++; }
      if (request.command === "clear") { state.bound = null; state.clears++; }
      if (request.command === "request") { state.permission = true; localStorage.setItem("qa:notification-permission", "granted"); }
      if (["token", "request"].includes(request.command) && state.permission) reply.token = "isolated-test-token-not-a-provider-token";
      if (request.command === "status") reply.status = { enabled: state.permission, messagesImportance: 4, callsImportance: 4, fullScreenAllowed: true };
      queueMicrotask(() => window.CircloPush.onmessage?.({ data: JSON.stringify(reply) }));
    } };
  }, { userId });
  await page.route("**/api/notifications/preferences", async route => {
    if (route.request().method() === "PATCH") Object.assign(preferences, route.request().postDataJSON());
    else if (failedRead) { failedReads++; return route.fulfill({ status: 503, contentType: "application/json", body: "{}" }); }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences }) });
  });
  await page.route("**/api/push/register", route => {
    if (route.request().method() === "POST" && failedEnrollment) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    if (route.request().method() === "POST") { registered = true; registrations++; }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().method() === "POST" ? { ok: true, deliveryConfigured: true } : { registered }) });
  });
  try {
    await page.bringToFront();
    await page.goto(base + "/app/chats");
    await page.getByRole("button", { name: "Allow notifications", exact: true }).click();
    await page.waitForFunction(id => window.nativeNotificationTest.permission && window.nativeNotificationTest.bound === id, userId);
    for (let n = 0; n < 40 && !registrations; n++) await page.waitForTimeout(50);
    assert(registrations > 0, "Allow performs native permission and server enrollment");
    assert.equal(preferences.pushNotifications, true);
    await page.goto(base + "/app/settings#notifications");
    const notificationPreferences = page.locator("#notifications details");
    await notificationPreferences.locator(":scope > summary").click();
    await page.locator("#notifications details[open]").waitFor();
    await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).waitFor();
    await page.waitForTimeout(150);
    assert.equal(await page.getByText("Enable push alerts on this device", { exact: true }).count(), 0, "Registered devices must not appear disabled after reopening settings");
    failedRead = true;
    await page.evaluate(() => window.dispatchEvent(new Event("circlo:native-push-refresh")));
    for (let n = 0; n < 40 && !failedReads; n++) await page.waitForTimeout(50);
    assert(failedReads > 0); await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => ({ bound: window.nativeNotificationTest.bound, clears: window.nativeNotificationTest.clears })), { bound: userId, clears: 0 }, "A failed resume must preserve the account binding and active call service");
    failedRead = false;
    const before = registrations;
    await page.evaluate(() => window.dispatchEvent(new Event("circlo:native-push-refresh")));
    for (let n = 0; n < 40 && registrations <= before; n++) await page.waitForTimeout(50);
    assert(registrations > before);
    await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).click();
    await page.waitForFunction(() => window.nativeNotificationTest.bound === null);
    assert.equal(preferences.pushNotifications, false, "Only explicit account opt-out clears delivery binding");
    await page.reload();
    await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).waitFor();
    assert.equal(await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).getAttribute("aria-checked"), "false");
    failedEnrollment = true;
    await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).click();
    await page.getByText("Push device registration was rejected.", { exact: true }).waitFor();
    assert.equal(preferences.pushNotifications,true,"A device enrollment failure must not undo account opt-in");
    await page.waitForFunction(id => window.nativeNotificationTest.bound === id, userId);
    failedEnrollment = false;
    await page.reload();
    await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).waitFor();
    assert.equal(await page.getByRole("switch", { name: "Desktop and mobile push", exact: true }).getAttribute("aria-checked"), "true");
    console.log("PASS: native onboarding permission, persisted opt-in, session registration status, failed-resume preservation and explicit opt-out (Android bridge simulated)");
  } finally { await page.close(); }
}
