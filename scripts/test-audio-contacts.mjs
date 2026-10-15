import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

export async function testAudioContacts(base, pool, owner, peer, password, conversationId) {
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only local fake fixtures");
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const errors = [];
  let outsiderId;
  const fixtureIds = []; let fixtureConversation;
  try {
    // Keep key enrollment, MFA and contact mutations isolated from other suites.
    const sourceId = owner.id, tag = Date.now().toString(36);
    const fixtures = [];
    for (const suffix of ["a", "b"]) {
      const name = "audio_" + tag + suffix;
      const row = (await pool.query("INSERT INTO users(username,display_name,email,password_hash,email_verified_at) SELECT $1,$1,$2,password_hash,now() FROM users WHERE id=$3 RETURNING id,username", [name, name + "@example.invalid", sourceId])).rows[0];
      fixtures.push(row); fixtureIds.push(row.id);
    }
    [owner, peer] = fixtures;
    fixtureConversation = (await pool.query("INSERT INTO conversations(type,created_by_id) VALUES('dm',$1) RETURNING id", [owner.id])).rows[0].id;
    conversationId = fixtureConversation;
    await pool.query("INSERT INTO conversation_members(conversation_id,user_id,accepted_at) VALUES($1,$2,now()),($1,$3,now())", [conversationId, owner.id, peer.id]);
    const contexts = [], pages = [];
    for (const account of [owner, peer]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"], serviceWorkers: "block", extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.146" } });
      await context.addInitScript({content: 'Object.defineProperty(navigator,"contacts",{configurable:true,value:{select:async()=>[{tel:["+15555550124"]}]}});'});
      await context.addInitScript(() => {
        window.__callPeers = []; window.__callTracks = [];
        const Peer = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends Peer { constructor(...args) { super(...args); window.__callPeers.push(this); } };
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (...args) => { const media = await capture(...args); window.__callTracks.push(...media.getTracks()); return media; };
      });
      const login = await context.request.post(base + "/api/auth/login", { headers: { Origin: base }, data: { identifier: account.username, password, acceptTerms: true, acceptPrivacy: true } });
      assert.equal(login.status(), 200); contexts.push(context);
      const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror", err => errors.push(err.message)); pages.push(page);
      await page.goto(base + "/app/chats/" + conversationId);
      await page.getByRole("button", { name: "Start audio call", exact: true }).waitFor();
    }
    const [a, b] = pages; const [ca, cb] = contexts;
    const post = (ctx, path, data) => ctx.request.post(base + path, { headers: { Origin: base }, data });
    assert.deepEqual((await (await ca.request.get(base + "/api/contacts")).json()).users, []);
    assert.deepEqual((await (await ca.request.get(base + "/api/users/search?q=")).json()).users, []);
    assert.equal((await post(ca, "/api/contacts", { userId: peer.id })).status(), 200);
    assert.equal((await post(ca, "/api/contacts", { userId: peer.id })).status(), 200);
    assert.equal((await (await ca.request.get(base + "/api/contacts")).json()).users.length, 1);
    assert.equal((await (await cb.request.get(base + "/api/contacts")).json()).users.length, 0, "Contacts are private and one-way");
    await pool.query("UPDATE users SET verified_phone='+15555550123',phone_discoverable=false WHERE id=$1", [peer.id]);
    const findPhone = async () => (await (await ca.request.get(base + "/api/users/search?q=%2B15555550123")).json()).users;
    assert.equal((await findPhone()).length, 0);
    assert.equal((await post(cb, "/api/contacts/phone", { enabled: true })).status(), 200);
    assert.equal((await findPhone())[0].id, peer.id);
    assert(!JSON.stringify(await findPhone()).includes("15555550123"), "Phone is not exposed in results");
    await post(cb, "/api/contacts/phone", { enabled: false }); assert.equal((await findPhone()).length, 0);
    // User-provided discovery numbers never become authentication credentials.
    await b.goto(base + "/app/profile");
    await b.getByLabel("Phone number", { exact: true }).fill("+15555550124");
    await b.getByLabel("Let people find me using my exact phone number", { exact: true }).check();
    await b.getByRole("button", { name: "Save phone number", exact: true }).click();
    await b.getByText("Phone settings saved.", { exact: true }).waitFor();
    assert.equal((await pool.query("SELECT verified_phone FROM users WHERE id=$1",[peer.id])).rows[0].verified_phone,"+15555550123");
    await a.goto(base + "/app/people");
    await a.waitForFunction(() => Boolean(navigator.contacts?.select));
    await a.getByRole("button",{name:"Find phone contacts",exact:true}).click();
    await a.getByText("User-provided number · not verified",{exact:true}).waitFor();
    assert(await a.getByText(peer.username,{exact:true}).isVisible());
    for (const page of pages) { await page.goto(base + "/app/chats/" + conversationId); await page.getByRole("button",{name:"Start audio call",exact:true}).waitFor(); }
    const noAuth = await browser.newContext(); assert.equal((await noAuth.request.get(base + "/api/calls")).status(), 401); await noAuth.close();
    assert.equal((await ca.request.post(base + "/api/calls", { headers: { Origin: "https://attacker.invalid" }, data: { action: "invite" } })).status(), 403);
    // Real browser offer/answer, DTLS audio, remote media and lifecycle, no mocked WebRTC.
    const began = Date.now();
    await a.getByRole("button", { name: "Start audio call", exact: true }).click();
    await b.getByRole("button", { name: "Answer", exact: true }).waitFor();
    const ringing = (await (await cb.request.get(base + "/api/calls")).json()).call;
    assert.equal(ringing.state, "ringing");
    assert.equal((await post(cb, "/api/calls", { action: "answer", id: ringing.id, clientId: crypto.randomUUID(), sdp: ringing.offer + "\r\nm=video\t9 UDP/TLS/RTP/SAVPF 96\r\n" })).status(), 400, "Non-audio media rejected even with alternate separators");
    assert(!("caller_client" in ringing) && !("callee_client" in ringing), "Control capabilities never leave their originating browser");
    const outsiderName = "call_outsider_" + Date.now();
    outsiderId = (await pool.query("INSERT INTO users(username,display_name,email,password_hash,email_verified_at) SELECT $1,$1,$2,password_hash,now() FROM users WHERE id=$3 RETURNING id", [outsiderName, outsiderName + "@example.invalid", owner.id])).rows[0].id;
    const outsider = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.146" } });
    assert.equal((await post(outsider, "/api/auth/login", { identifier: outsiderName, password, acceptTerms: true, acceptPrivacy: true })).status(), 200);
    assert.equal((await (await outsider.request.get(base + "/api/calls")).json()).call, null);
    assert.equal((await post(outsider, "/api/calls", { action: "answer", id: ringing.id, clientId: crypto.randomUUID(), sdp: ringing.offer })).status(), 404);
    assert.equal((await post(outsider, "/api/calls", { action: "end", id: ringing.id, clientId: crypto.randomUUID() })).status(), 404);
    await outsider.close();
    assert.equal((await post(ca, "/api/calls", { action: "answer", id: ringing.id, clientId: crypto.randomUUID(), sdp: ringing.offer })).status(), 409, "Caller cannot answer its own call");
    assert.equal((await post(cb, "/api/calls", { action: "invite", conversationId, clientId: crypto.randomUUID(), sdp: ringing.offer })).status(), 409, "Cross-call busy gate");
    await b.getByRole("button", { name: "Answer", exact: true }).click();
    await a.getByText("Audio connected", { exact: true }).waitFor(); await b.getByText("Audio connected", { exact: true }).waitFor();
    console.log("Audio setup including ICE gathering:", Date.now() - began, "ms");
    await a.getByRole("textbox", { name: "Message text", exact: true }).click();
    await a.getByRole("textbox", { name: "Message text", exact: true }).fill("Draft while calling");
    await a.getByRole("button", { name: "Mute", exact: true }).click();
    assert.equal(await a.getByRole("button", { name: "Unmute", exact: true }).getAttribute("aria-pressed"), "true");
    await a.getByRole("button", { name: "Unmute", exact: true }).click();
    for (const page of pages) {
      await page.waitForFunction(async () => { const stats = await window.__callPeers.at(-1).getStats(); return [...stats.values()].some(stat => stat.type === "inbound-rtp" && stat.kind === "audio" && stat.bytesReceived > 0); });
      await page.waitForFunction(() => { const audio = document.querySelector("audio"); return audio?.srcObject?.getAudioTracks().some(track => track.readyState === "live"); });
      for (const size of [{ width: 320, height: 640 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        if (page === a && size.width === 320) { await mkdir(".freebuff/performance", { recursive: true }); await page.screenshot({ path: ".freebuff/performance/audio-mobile-320.png" }); }
        const box = await page.getByRole("region", { name: "Audio call", exact: true }).boundingBox();
        assert(box && box.x >= 0 && box.x + box.width <= size.width && box.y >= 0 && box.y + box.height <= size.height);
        const theme = page.getByRole("button", { name: "Change theme", exact: true });
        if (await theme.isVisible()) {
          const themeBox = await theme.boundingBox();
          assert(themeBox && (box.x + box.width <= themeBox.x || box.y >= themeBox.y + themeBox.height), "Call strip leaves global theme and account controls clear");
        }
      }
    }
    const active = (await (await ca.request.get(base + "/api/calls")).json()).call;
    assert.equal((await post(cb, "/api/calls", { action: "end", id: active.id, clientId: crypto.randomUUID() })).status(), 409, "Another browser cannot end an answered call");
    await a.getByRole("button", { name: "Open call controls", exact: true }).click();
    const expanded = await a.getByRole("region", { name: "Audio call", exact: true }).boundingBox();
    assert(expanded && expanded.y >= 0 && expanded.y + expanded.height <= 390, "Expanded landscape call controls fit");
    await a.getByRole("button", { name: "Minimize call controls", exact: true }).click();
    await a.getByRole("button", { name: "End call", exact: true }).click();
    assert.equal(await a.getByRole("textbox", { name: "Message text", exact: true }).inputValue(), "Draft while calling");
    await b.getByText("Call ended or was not answered.", { exact: true }).waitFor();
    assert.equal((await (await ca.request.get(base + "/api/calls")).json()).call, null);
    for (const page of pages) assert(await page.evaluate(() => window.__callTracks.every(track => track.readyState === "ended") && window.__callPeers.every(pc => pc.connectionState === "closed")), "Hang-up releases microphone and connection");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audio_calls WHERE id=$1", [active.id])).rows[0].n, 0, "Ended SDP removed");
    await a.setViewportSize({ width: 390, height: 844 }); await b.setViewportSize({ width: 390, height: 844 });
    await a.getByRole("button", { name: "Start audio call", exact: true }).click();
    await b.getByRole("button", { name: "Decline", exact: true }).click();
    await a.getByText("Call ended or was not answered.", { exact: true }).waitFor();
    await pool.query("INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)", [peer.id, owner.id]);
    assert.equal((await post(ca, "/api/calls", { action: "invite", conversationId, clientId: crypto.randomUUID(), sdp: ringing.offer })).status(), 403);
    assert.equal((await (await ca.request.get(base + "/api/contacts")).json()).users.length, 0, "Blocked contact hidden");
    await pool.query("DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2", [peer.id, owner.id]);
    await pool.query("UPDATE conversation_members SET accepted_at=NULL WHERE conversation_id=$1 AND user_id=$2", [conversationId, peer.id]);
    assert.equal((await post(ca, "/api/calls", { action: "invite", conversationId, clientId: crypto.randomUUID(), sdp: ringing.offer })).status(), 403);
    await pool.query("UPDATE conversation_members SET accepted_at=now() WHERE conversation_id=$1 AND user_id=$2", [conversationId, peer.id]);
    // A visible app shows a tappable banner for another screen, but stays quiet in the open chat.
    const baseline = "Banner baseline " + Date.now();
    await a.getByRole("textbox",{name:"Message text",exact:true}).fill(baseline);
    await a.getByRole("textbox",{name:"Message text",exact:true}).press("Enter");
    await b.getByRole("region",{name:"Conversation",exact:true}).getByText(baseline,{exact:true}).waitFor();
    assert.equal(await b.getByRole("status",{name:"New message notification",exact:true}).count(),0);
    await b.goto(base + "/app/profile");
    const alertText = "Foreground banner " + Date.now();
    await a.getByRole("textbox",{name:"Message text",exact:true}).fill(alertText);
    await a.getByRole("textbox",{name:"Message text",exact:true}).press("Enter");
    const banner = b.getByRole("status",{name:"New message notification",exact:true});
    await banner.waitFor();
    await banner.getByRole("link").click();
    await b.getByRole("region",{name:"Conversation",exact:true}).getByText(alertText,{exact:true}).waitFor();
    assert.equal(await banner.count(),0);
    // Microphone denial must be useful and must not create a phantom call.
    await a.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
    await a.getByRole("button", { name: "Start audio call", exact: true }).click();
    await a.getByText(/Microphone permission is needed/).waitFor();
    assert.equal((await (await ca.request.get(base + "/api/calls")).json()).call, null);
    // No trusted-key bypass is needed for calls; message encryption remains unchanged.
    await pool.query("UPDATE users SET display_name=$1,bio=$2 WHERE id=$3", ["W".repeat(50), "W".repeat(160), owner.id]);
    for (const size of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await a.setViewportSize(size); await a.goto(base + "/app/profile");
      await a.getByRole("heading", { name: "W".repeat(50), exact: true }).waitFor();
      for (const detail of await a.locator("details").all()) {
        const summary = detail.locator(":scope > summary"); if (await summary.isVisible()) await summary.click();
      }
      assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Profile must not overflow horizontally");
      await a.getByRole("button", { name: "Edit profile", exact: true }).click();
      assert(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await pool.query("UPDATE users SET display_name=username,bio=NULL WHERE id=$1", [owner.id]);
    await a.goto(base + "/app/people"); await a.getByText(peer.username, { exact: true }).waitFor();
    assert.equal(await a.getByRole("button", { name: "Remove contact", exact: true }).count(), 1);
    await a.getByRole("button", { name: "Remove contact", exact: true }).click();
    await a.getByText("Your contacts will appear here", { exact: true }).waitFor();
    await a.getByRole("searchbox", { name: "Search people" }).fill(peer.username);
    await a.getByRole("button", { name: "Add contact", exact: true }).click();
    await a.getByRole("button", { name: "Remove contact", exact: true }).waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS real two-browser audio, answer/decline/mute/hangup, CSRF/auth/client ownership/busy, SDP cleanup, private contacts/phone opt-in, profile 320/390/844/1280 layouts");
  } finally {
    await browser.close();
    if (fixtureConversation) await pool.query("DELETE FROM conversations WHERE id=$1 AND created_by_id=$2", [fixtureConversation, fixtureIds[0]]);
    for (const id of fixtureIds) await pool.query("DELETE FROM users WHERE id=$1 AND username LIKE 'audio_%'", [id]);
    if (outsiderId) await pool.query("DELETE FROM users WHERE id=$1 AND username LIKE 'call_outsider_%'", [outsiderId]);
  }
}
