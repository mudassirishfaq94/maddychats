import { fixtureAppSession } from "./fixture-app-session.mjs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import bcrypt from "bcryptjs";

/** Actual Chromium worker + authenticated local API; no external push services or real accounts. */
export async function testPwaNotifications(base, pool) {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  // Windows headless_shell cannot present native Notification objects. Use
  // installed Chrome there; CI uses Playwright's full Chromium new-headless.
  const browser = await chromium.launch({ channel: process.env.PWA_BROWSER_CHANNEL || (process.platform === "win32" ? "chrome" : "chromium") });
  const accounts = []; let conversation;
  const password = "Aa9" + randomBytes(20).toString("hex");
  const errors = [];
  try {
    const hash = await bcrypt.hash(password, 12);
    for (const suffix of ["recipient", "sender"]) {
      const name = "pwaqa_" + randomBytes(6).toString("hex") + suffix;
      accounts.push((await pool.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id,username", [name, name + "@example.invalid", hash])).rows[0]);
    }
    const [owner, peer] = accounts;
    await pool.query("insert into notification_preferences(user_id,show_notification_details) values($1,true)", [owner.id]);
    conversation = (await pool.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [peer.id])).rows[0].id;
    await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation, owner.id, peer.id]);
    const notices = [];
    for (let i = 0; i < 5; i++) {
      const message = (await pool.query("insert into messages(conversation_id,sender_id,text,encrypted) values($1,$2,'disposable-notification-ciphertext',true) returning id", [conversation, peer.id])).rows[0];
      notices.push((await pool.query("insert into notifications(user_id,actor_id,type,data) values($1,$2,'message',$3) returning id", [owner.id, peer.id, JSON.stringify({ conversationId: conversation, messageId: message.id, actorName: "Owned push sender", preview: "Must not expose any message content" })])).rows[0]);
    }
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, permissions: ["notifications"], serviceWorkers: "allow" });
    await context.grantPermissions(["notifications"], { origin: base });
    const login = async account => { const r = await context.request.post(base + "/api/auth/login", { data: { identifier: account.username, password, acceptTerms: true, acceptPrivacy: true }, headers: { Origin: base } }); assert.equal(r.status(), 200); await fixtureAppSession(pool,r); };
    await login(owner);
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror", error => errors.push(error.message));
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route("**/_next/static/chunks/*.js*", async route => { await gate; await route.continue(); });
    await page.goto(base + "/app/profile", { waitUntil: "domcontentloaded" });
    // Emulate installed display before hydration; the exact same CSS/SSR logo
    // is used by the actual standalone media query and iOS installed flag.
    await page.evaluate(() => { document.documentElement.dataset.installedApp = "true"; });
    await page.getByRole("status", { name: "Opening Circlo", exact: true }).waitFor();
    assert(await page.getByText("Your circle. Your secrets. Sealed.", { exact: true }).first().isVisible());
    await mkdir(".freebuff/performance", { recursive: true });
    await page.screenshot({ path: ".freebuff/performance/pwa-launch-320.png" });
    release(); await page.unrouteAll({ behavior: "wait" });
    await page.getByRole("status", { name: "Opening Circlo", exact: true }).waitFor({ state: "detached" });
    await page.getByRole("heading", { name: owner.username, exact: true }).waitFor();
    await page.locator("summary").filter({ has: page.getByText("Notifications", { exact: true }) }).click();
    const help = page.locator("#notifications details").filter({ has: page.getByText("Notifications arrive, but no pop-up?", { exact: true }) });
    await help.locator("summary").click();
    assert(await help.getByText(/Android and your browser decide whether to show a banner/).isVisible());
    assert(await help.getByText(/Press and hold an actual Circlo message/).isVisible());
    assert.equal(await page.getByRole("button", { name: "Open Android notification settings", exact: true }).count(), 0, "Browser UI must not promise a native settings bridge");
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready; });
    let worker = context.serviceWorkers().find(value => value.url().endsWith("/sw.js"));
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const control = await context.newPage(); const cdp = await context.newCDPSession(control);
    let registrationId;
    cdp.on("ServiceWorker.workerRegistrationUpdated", event => { const row = event.registrations.find(row => row.scopeURL === base + "/" && !row.isDeleted); if (row) registrationId = row.registrationId; });
    await cdp.send("ServiceWorker.enable");
    for (let i = 0; i < 100 && !registrationId; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert(registrationId, "Actual service worker registration must be visible to Chromium");
    const cards = () => worker.evaluate("self.registration.getNotifications().then(cards => cards.map(card => ({ title: card.title, body: card.body, tag: card.tag, silent: card.silent, renotify: card.renotify, vibrate: card.vibrate, data: card.data })))");
    const push = async index => {
      await cdp.send("ServiceWorker.deliverPushMessage", { origin: base, registrationId, data: JSON.stringify({ notificationId: notices[index].id, recipientId: owner.id }) });
      await worker.evaluate("pushWork.then(() => true)");
    };
    await page.bringToFront(); assert.equal(await page.evaluate(() => document.visibilityState), "visible");
    await push(0); assert.equal((await cards()).length, 0, "Any visible app page suppresses foreground cards");
    // Headless Chromium reports every tab visible, even after switching tabs.
    // Simulate only client visibility; push handling, authenticated fetch and
    // Notification objects still run in the real worker. Closed-window delivery
    // below uses the actual clients API without this override.
    await worker.evaluate("self.originalMatchAll = self.clients.matchAll.bind(self.clients); self.clients.matchAll = async options => (await self.originalMatchAll(options)).map(client => ({url: client.url, visibilityState: 'hidden'}))");
    await push(0); let shown = await cards(); assert.equal(shown.length, 1); assert.equal(shown[0].title, "Owned push sender · Circlo");
    assert(!shown[0].body.includes("Must not expose"));
    await push(1); shown = await cards(); assert.equal(shown.length, 1); assert.equal(shown[0].data.count, 2);
    await push(1); assert.equal((await cards())[0].data.count, 2, "Redelivery cannot duplicate a message");
    await pool.query("insert into notification_preferences(user_id,notification_sound) values($1,false) on conflict(user_id) do update set notification_sound=false", [owner.id]);
    await push(2); assert.equal((await cards())[0].silent, true);
    await page.close();
    await worker.evaluate("self.clients.matchAll = self.originalMatchAll; delete self.originalMatchAll");
    await push(3); assert.equal((await cards())[0].data.count, 4, "Worker handles a push with no app window");
    // Real Chromium worker presents a live incoming call with every app window closed.
    await pool.query("insert into notification_preferences(user_id,push_notifications) values($1,true) on conflict(user_id) do update set push_notifications=true", [owner.id]);
    const incoming = (await pool.query("INSERT INTO audio_calls(conversation_id,caller_id,callee_id,caller_client,offer) VALUES($1,$2,$3,$4,'local-call-push-fixture') RETURNING id", [conversation,peer.id,owner.id,crypto.randomUUID()])).rows[0];
    const incomingNotice = (await pool.query("INSERT INTO notifications(user_id,actor_id,type,data) VALUES($1,$2,'call',$3) RETURNING id",[owner.id,peer.id,JSON.stringify({callId:incoming.id,conversationId:conversation})])).rows[0];
    const pushCall = async () => {
      await cdp.send("ServiceWorker.deliverPushMessage", { origin:base,registrationId,data:JSON.stringify({notificationId:incomingNotice.id,recipientId:owner.id,callId:incoming.id}) });
      await worker.evaluate("pushWork.then(() => true)");
    };
    await pushCall();
    assert((await cards()).some(card => card.data.callId === incoming.id),"Closed-window incoming call card appears");
    const callUrl = (await cards()).find(card => card.data.callId === incoming.id).data.url;
    assert.equal(callUrl,`/app/chats/${conversation}?call=${incoming.id}`);
    await pool.query("UPDATE audio_calls SET state='active' WHERE id=$1",[incoming.id]);
    await pushCall(); assert(!(await cards()).some(card => card.data.callId===incoming.id),"Answered call removes its ringing card");
    await pool.query("DELETE FROM audio_calls WHERE id=$1",[incoming.id]);
    await pool.query("update conversation_members set muted_at=now() where conversation_id=$1 and user_id=$2", [conversation, owner.id]);
    await push(4); assert.equal((await cards()).find(card => card.data.messageIds)?.data.count, 4, "Mute is rechecked on delivery");
    await pool.query("update conversation_members set muted_at=null where conversation_id=$1 and user_id=$2", [conversation, owner.id]);
    const delivery = () => context.request.get(base + "/api/notifications/push/delivery?id=" + notices[4].id, { headers: { Origin: base } });
    const response = await delivery(); assert.equal(response.status(), 200); assert.equal(response.headers()["cache-control"], "private, no-store");
    await pool.query("update notifications set read_at=now() where id=$1", [notices[4].id]);
    assert.equal((await delivery()).status(), 404, "Read notifications cannot be replayed");
    await pool.query("update notifications set read_at=null where id=$1", [notices[4].id]);
    const messageId = (await response.json()).messageId;
    await pool.query("insert into message_deletions(message_id,user_id) values($1,$2)", [messageId, owner.id]);
    assert.equal((await delivery()).status(), 404, "Messages hidden by this recipient stay private");
    await pool.query("delete from message_deletions where message_id=$1 and user_id=$2", [messageId, owner.id]);
    await pool.query("update messages set expires_at=now()-interval '1 second' where id=$1", [messageId]);
    assert.equal((await delivery()).status(), 404, "Expired messages cannot be presented");
    await pool.query("update messages set expires_at=null where id=$1", [messageId]);
    // Exercise the actual WindowClient navigation, not a mocked browser URL.
    const tapped = shown[0].data;
    const tappedPage = await context.newPage();
    await tappedPage.route("**/api/conversations/*/read", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"readCount":0,"messageIds":[]}' }));
    await tappedPage.goto(base + "/app/profile");
    await worker.evaluate(data => openChatFromNotification(data), tapped);
    await tappedPage.waitForURL(base + tapped.url);
    assert.equal(new URL(tappedPage.url()).searchParams.get("message"), tapped.messageIds.at(-1));
    await tappedPage.close();
    const loggedOut = await browser.newContext();
    const loginPage = await loggedOut.newPage(); await loginPage.goto(base + tapped.url);
    assert.equal(new URL(loginPage.url()).pathname, "/login");
    assert.equal(new URL(loginPage.url()).searchParams.get("next"), tapped.url, "Sign-in preserves the exact message link");
    await loggedOut.close();
    await worker.evaluate("self.registration.getNotifications().then(cards => cards.forEach(card => card.close()))");
    await pool.query("update notification_preferences set notification_sound=false where user_id=$1", [owner.id]);
    await push(4);
    let quiet = (await cards())[0];
    assert.equal(quiet.silent, true); assert.equal(quiet.renotify, false);
    assert.equal(quiet.data.lastAlertAt, 0, "A quiet card must not consume the audible re-alert cooldown");
    await pool.query("update notification_preferences set notification_sound=true where user_id=$1", [owner.id]);
    await push(0);
    const audible = (await cards())[0];
    assert.equal(audible.silent, false); assert.equal(audible.renotify, true, "First audible replacement requests attention after a quiet card");
    assert(audible.vibrate.length > 0); assert(audible.data.lastAlertAt > 0);
    await worker.evaluate("self.registration.getNotifications().then(cards => cards.forEach(card => card.close()))");
    await worker.evaluate(() => {
      self.savedDeliveryFetch = self.fetch;
      self.fetch = async (input, init) => String(input).startsWith("/api/notifications/push/delivery")
        ? new Response("{}", { status: 503 }) : self.savedDeliveryFetch(input, init);
    });
    try {
      await push(4); quiet = (await cards())[0];
      assert.equal(quiet.silent, true); assert.equal(quiet.renotify, false);
      assert.equal(quiet.vibrate.length, 0); assert.equal(quiet.title, "Circlo");
      assert.equal(quiet.data.url, "/app/chats");
      await push(4); assert.equal((await cards())[0].data.count, 1, "Offline redelivery must not duplicate the generic alert");
    } finally {
      await worker.evaluate("self.fetch = self.savedDeliveryFetch; delete self.savedDeliveryFetch");
      await worker.evaluate("self.registration.getNotifications().then(cards => cards.forEach(card => card.close()))");
    }
    await login(peer); assert.equal((await delivery()).status(), 404); await push(4); assert.equal((await cards()).length, 0, "Account switching cannot reveal the previous account's sender");
    await context.request.post(base + "/api/auth/logout", { headers: { Origin: base } });
    assert.equal((await delivery()).status(), 401); await push(4); assert.equal((await cards()).length, 0, "Logged-out clients cannot fetch private presentation");
    assert.deepEqual(errors, []);
    console.log("PASS Chromium worker: launch branding, foreground quiet, simulated background visibility, actual closed-window delivery, grouping/deduplication, silent setting, mute, account isolation and logout. External delivery and phone OS UI require real-device verification.");
    return { launchBranding: true, foregroundQuiet: true, simulatedBackground: true, closedApp: true, grouping: true, accountIsolation: true, realPhoneDelivery: false };
  } finally {
    await browser.close();
    if (conversation) await pool.query("delete from conversations where id=$1", [conversation]);
    for (const account of accounts) await pool.query("delete from users where id=$1 and username=$2 and username like 'pwaqa_%'", [account.id, account.username]);
  }
}


