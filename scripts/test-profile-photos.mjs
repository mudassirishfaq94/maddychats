import assert from "node:assert/strict";
import sharp from "sharp";
import { decryptPrivateKeyFromStorage, importPrivateKey, decryptKeyFromSender, decryptMessage } from "../src/lib/crypto.ts";

/** Only disposable accounts; the caller removes the returned owned uploads/group. */
export async function testProfilePhotos(base, pool, owner, peer, source, unrelatedCookie, peerCookie) {
  assert(/^(restored_|releaseqa_)/.test(owner.username));
  const paths = [];
  const original = (await pool.query("select display_name,bio,avatar_url from users where id=$1", [owner.id])).rows[0];
  const png = await sharp({ create: { width: 1400, height: 1100, channels: 3, background: "#343042" } }).png().toBuffer();
  await source.page.goto(base + "/app/profile");
  const uploaded = source.page.waitForResponse(r => r.url().endsWith("/api/upload/avatar") && r.request().method() === "POST");
  await source.page.locator('input[type="file"]').first().setInputFiles({ name: "profile-check.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from("TRAILING_FIXTURE_PAYLOAD")]) });
  const response = await uploaded; assert.equal(response.status(), 200);
  const result = await response.json(); paths.push(result.attachment.path);
  assert.equal(result.attachment.mimeType, "image/webp");
  assert.equal((await pool.query("select avatar_url from users where id=$1", [owner.id])).rows[0].avatar_url, result.user.avatarUrl);
  const image = await fetch(base + result.user.avatarUrl, { headers: { Cookie: source.cookies } }); assert.equal(image.status, 200);
  const bytes = Buffer.from(await image.arrayBuffer()); const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "webp"); assert(metadata.width <= 1024 && metadata.height <= 1024);
  assert(!bytes.includes(Buffer.from("TRAILING_FIXTURE_PAYLOAD")) && !metadata.exif);
  const invalid = new FormData(); invalid.append("file", new File(["<svg/>"], "fake.png", { type: "image/png" }));
  assert.equal((await fetch(base + "/api/upload/avatar", { method: "POST", headers: { Origin: base, Cookie: source.cookies }, body: invalid })).status, 422);
  assert.equal((await fetch(base + "/api/upload/avatar", { method: "POST", headers: { Origin: base }, body: invalid })).status, 401);
  await source.page.getByRole("button", { name: "Edit profile", exact: true }).click();
  const displayName = "Profile verified " + owner.id.slice(0, 8);
  await source.page.getByLabel("Display name", { exact: true }).fill(displayName);
  const save = source.page.waitForResponse(r => r.url().endsWith("/api/users/me") && r.request().method() === "PATCH");
  await source.page.getByRole("button", { name: "Save changes", exact: true }).click(); assert.equal((await save).status(), 200);
  assert.equal((await pool.query("select display_name from users where id=$1", [owner.id])).rows[0].display_name, displayName);
  await pool.query("update users set display_name=$2,bio=$3 where id=$1", [owner.id, original.display_name, original.bio]);
  const create = await fetch(base + "/api/groups", { method: "POST", headers: { Origin: base, Cookie: source.cookies, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Owned photo check", memberIds: [peer.id] }) });
  assert.equal(create.status, 201); const group = (await create.json()).conversation;
  const form = () => { const body = new FormData(); body.append("file", new File([png], "photo.png", { type: "image/png" })); return body; };
  const avatar = await fetch(base + `/api/groups/${group.id}/avatar`, { method: "POST", headers: { Origin: base, Cookie: source.cookies }, body: form() });
  assert.equal(avatar.status, 200); const avatarUrl = (await avatar.json()).avatarUrl; paths.push(avatarUrl.replace("/api/media/", ""));
  assert.equal((await fetch(base + `/api/groups/${group.id}/avatar`, { method: "POST", headers: { Origin: base, Cookie: unrelatedCookie }, body: form() })).status, 404);
  // Actual mobile UI edits, persisted reload, and an actionable failed-save retry.
  await source.page.goto(base + `/app/chats/${group.id}`);
  await source.page.setViewportSize({ width: 320, height: 740 });
  await source.page.getByRole("button", { name: "Chat options", exact: true }).click();
  await source.page.getByRole("menuitem", { name: "Group info", exact: true }).click();
  await source.page.getByRole("button", { name: "Group settings", exact: true }).click();
  const settings = source.page.getByRole("region", { name: "Group settings", exact: true });
  assert(await source.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Group settings fit a 320px phone");
  await settings.getByLabel("Group name", { exact: true }).fill("Edited group name");
  await settings.getByLabel("Group description", { exact: true }).fill("Description saved after creation");
  const saveSettings = source.page.waitForResponse(r => r.url().endsWith(`/api/groups/${group.id}/settings`) && r.request().method() === "PATCH");
  await settings.getByRole("button", { name: "Save group settings", exact: true }).click();
  assert.equal((await saveSettings).status(), 200);
  await settings.getByText("Group settings saved.", { exact: true }).waitFor();
  assert.deepEqual((await pool.query("select name,description from conversations where id=$1", [group.id])).rows[0], { name: "Edited group name", description: "Description saved after creation" });
  await source.page.reload();
  await source.page.getByRole("button", { name: "Chat options", exact: true }).click();
  await source.page.getByRole("menuitem", { name: "Group info", exact: true }).click();
  await source.page.getByRole("button", { name: "Group settings", exact: true }).click();
  assert.equal(await settings.getByLabel("Group name", { exact: true }).inputValue(), "Edited group name");
  assert.equal(await settings.getByLabel("Group description", { exact: true }).inputValue(), "Description saved after creation");
  const uploadedGroup = source.page.waitForResponse(r => r.url().endsWith(`/api/groups/${group.id}/avatar`) && r.request().method() === "POST");
  await settings.getByLabel("Group photo", { exact: true }).setInputFiles({ name: "group.png", mimeType: "image/png", buffer: png });
  const photoResponse = await uploadedGroup; assert.equal(photoResponse.status(), 200);
  paths.push((await photoResponse.json()).avatarUrl.replace("/api/media/", ""));
  await settings.getByText("Group photo updated.", { exact: true }).waitFor();
  const failSettings = route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Owned save failure. Retry safely." }) });
  await source.page.route(`**/api/groups/${group.id}/settings`, failSettings);
  await settings.getByRole("button", { name: "Save group settings", exact: true }).click();
  await settings.getByRole("alert").filter({ hasText: "Owned save failure" }).waitFor();
  await source.page.unroute(`**/api/groups/${group.id}/settings`, failSettings);
  await settings.getByRole("button", { name: "Save group settings", exact: true }).click();
  await settings.getByText("Group settings saved.", { exact: true }).waitFor();
  await source.page.getByRole("button", { name: "Close details", exact: true }).click();
  const composer = source.page.getByRole("textbox", { name: "Message text", exact: true });
  await composer.fill("Group encryption before removal"); await composer.press("Enter");
  await source.page.locator("p").filter({ hasText: /^Group encryption before removal$/ }).waitFor();
  let baseline;
  for (let i = 0; i < 100; i++) {
    baseline = (await pool.query("select id,text from messages where conversation_id=$1 order by created_at desc limit 1", [group.id])).rows[0];
    if (baseline) break; await source.page.waitForTimeout(200);
  }
  assert(baseline); assert.notEqual(baseline.text, "Group encryption before removal");
  const peerDevice = (await pool.query("select device_id from e2ee_keys where user_id=$1 and trusted_at is not null order by created_at desc limit 1", [peer.id])).rows[0];
  // The original peer browser has the private key for this exact recipient wrap.
  const peerState = await source.page.context().browser().contexts().reduce(async (previous, context) => {
    const found = await previous; if (found) return found;
    for (const page of context.pages()) {
      const stored = await page.evaluate(userId => ({ pair: localStorage.getItem(`e2ee_keypair_${userId}`), device: localStorage.getItem("e2ee_device_id"), recovery: localStorage.getItem(`e2ee_recovery_${userId}_${localStorage.getItem("e2ee_device_id")}`) }), peer.id).catch(() => null);
      if (stored?.pair && stored.device === peerDevice.device_id) return { ...stored, page };
    }
    return null;
  }, Promise.resolve(null));
  assert(peerState?.recovery);
  await peerState.page.goto(base + `/app/chats/${group.id}`);
  await peerState.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Group encryption before removal", { exact: true }).waitFor();
  const pair = JSON.parse(peerState.pair);
  const jwk = await decryptPrivateKeyFromStorage(pair.encryptedPrivateKey.slice(3), peerState.recovery);
  const privateKey = await importPrivateKey(jwk);
  const wraps = (await pool.query("select encrypted_key from e2ee_conversation_keys where conversation_id=$1 and user_id=$2 and recipient_device_id=$3", [group.id, peer.id, peerDevice.device_id])).rows;
  const oldKeys = await Promise.all(wraps.map(row => decryptKeyFromSender(row.encrypted_key, privateKey)));
  assert((await Promise.all(oldKeys.map(key => decryptMessage(baseline.text, key).catch(() => null)))).includes("Group encryption before removal"));
  const removed = await fetch(base + `/api/groups/${group.id}/members/${peer.id}`, { method: "DELETE", headers: { Origin: base, Cookie: source.cookies } }); assert.equal(removed.status, 200);
  await composer.fill("Group encryption after removal"); await composer.press("Enter");
  const approve = source.page.getByRole("button").filter({ hasText: "Encryption device keys changed" });
  await approve.waitFor(); await approve.click();
  await source.page.locator("p").filter({ hasText: /^Group encryption after removal$/ }).waitFor();
  let after;
  for (let i = 0; i < 100; i++) {
    after = (await pool.query("select id,text from messages where conversation_id=$1 order by created_at desc limit 1", [group.id])).rows[0];
    if (after && after.id !== baseline.id) break; await source.page.waitForTimeout(200);
  }
  assert.notEqual(after.id, baseline.id);
  assert((await Promise.all(oldKeys.map(key => decryptMessage(after.text, key).catch(() => null)))).every(value => value === null), "Removed member's retained AES keys cannot decrypt the new group message");
  assert.equal((await fetch(base + `/api/e2ee/conversation-keys?conversationId=${group.id}&deviceId=${peerDevice.device_id}`, { headers: { Cookie: peerCookie } })).status, 404);
  const inviteResponse = await fetch(base + `/api/groups/${group.id}/invites`, { method: "POST", headers: { Origin: base, Cookie: source.cookies, "Content-Type": "application/json" }, body: JSON.stringify({ maxUses: 1 }) });
  assert.equal(inviteResponse.status, 201);
  const invite = (await inviteResponse.json()).link;
  await peerState.page.goto(base + `/invite/${invite.code}`);
  assert.equal((await pool.query("select count(*)::int n from conversation_members where conversation_id=$1 and user_id=$2", [group.id, peer.id])).rows[0].n, 0);
  await peerState.page.getByRole("button", { name: "Join group", exact: true }).click();
  await peerState.page.waitForURL(`**/app/chats/${group.id}`);
  assert.equal((await pool.query("select count(*)::int n from conversation_members where conversation_id=$1 and user_id=$2", [group.id, peer.id])).rows[0].n, 1);
  await composer.fill("Group encryption after rejoining"); await composer.press("Enter");
  await approve.waitFor(); await approve.click();
  await peerState.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Group encryption after rejoining", { exact: true }).waitFor();
  assert.equal((await pool.query("select count(*)::int n from messages where conversation_id=$1 and encrypted=false", [group.id])).rows[0].n, 0);
  console.log("PASS mobile group name/description/photo UI, save retry, and retained-key exclusion after removal");
  const background = await fetch(base + `/api/conversations/${group.id}/background`, { method: "PATCH", headers: { Origin: base, Cookie: source.cookies }, body: form() });
  assert.equal(background.status, 200); const style = (await background.json()).backgroundStyle;
  assert(style.startsWith("data:image/webp;base64,"));
  assert.equal((await sharp(Buffer.from(style.split(",")[1], "base64")).metadata()).format, "webp");
  await source.page.setViewportSize({ width: 320, height: 740 });
  for (const screen of ["/app", "/app/chats", "/app/people", "/app/communities", "/app/status", "/app/profile", "/app/settings", "/app/starred"]) {
    const page = await source.page.goto(base + screen); assert.equal(page.status(), 200, screen);
    assert(!await source.page.getByText("Application error: a client-side exception has occurred", { exact: false }).count());
    assert(await source.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${screen}`);
    if (screen === "/app/profile") assert(await source.page.locator("h1").evaluate(heading => heading.scrollWidth <= heading.clientWidth + 1), "Long profile names wrap inside their card");
  }
  const failure = route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary fixture failure. Please retry." }) });
  await source.page.route("**/api/users/search?*", failure);
  await source.page.goto(base + "/app/people"); await source.page.getByText("Search hit a snag", { exact: true }).waitFor();
  await source.page.unroute("**/api/users/search?*", failure);
  const retried = source.page.waitForResponse(r => r.url().includes("/api/users/search?") && r.status() === 200);
  await source.page.getByRole("button", { name: "Try again", exact: true }).click(); await retried;
  await source.page.route("**/api/communities", failure);
  await source.page.goto(base + "/app/communities"); await source.page.getByText("Could not load communities. Please try again.", { exact: true }).waitFor();
  await source.page.unroute("**/api/communities", failure);
  const reload = source.page.waitForResponse(r => r.url().endsWith("/api/communities") && r.status() === 200);
  await source.page.getByRole("button", { name: "Try again", exact: true }).click(); await reload;
  await source.page.route("**/api/communities", async route => route.request().method() === "POST" ? failure(route) : route.continue());
  await source.page.getByRole("button", { name: "Create community", exact: true }).click();
  await source.page.getByPlaceholder("Community name", { exact: true }).fill("Owned failure check");
  await source.page.getByRole("button", { name: "Create", exact: true }).click();
  await source.page.getByText("Temporary fixture failure. Please retry.", { exact: true }).waitFor();
  await source.page.getByRole("button", { name: "Cancel", exact: true }).click(); await source.page.unroute("**/api/communities");
  const privateResponse = await fetch(base + "/api/communities", { method: "POST", headers: { Origin: base, Cookie: source.cookies, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Owned private component check", isPublic: false }) });
  assert.equal(privateResponse.status, 201); const community = (await privateResponse.json()).community;
  let channel;
  try {
    assert.equal((await fetch(base + `/api/communities/${community.id}`, { headers: { Cookie: unrelatedCookie } })).status, 404);
    const blocked = await fetch(base + `/api/communities/${community.id}`, { method: "POST", headers: { Origin: base, Cookie: unrelatedCookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_channel", name: "forbidden-channel" }) });
    assert.equal(blocked.status, 404);
    if (peerCookie) {
      await pool.query("insert into community_members(community_id,user_id,role) values($1,$2,'member')", [community.id, peer.id]);
      assert.equal((await fetch(base + `/api/communities/${community.id}`, { headers: { Cookie: peerCookie } })).status, 200);
      const memberCreate = await fetch(base + `/api/communities/${community.id}`, { method: "POST", headers: { Origin: base, Cookie: peerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_channel", name: "member-forbidden" }) });
      assert.equal(memberCreate.status, 403);
    }
    assert.equal((await pool.query("select count(*)::int as n from channels where community_id=$1", [community.id])).rows[0].n, 0);
    await source.page.goto(base + `/app/communities/${community.id}`);
    await source.page.getByRole("button", { name: "Create channel", exact: true }).click();
    await source.page.getByPlaceholder("channel-name", { exact: true }).fill("fixture-channel");
    const created = source.page.waitForResponse(r => r.url().endsWith(`/api/communities/${community.id}`) && r.request().method() === "POST");
    await source.page.getByRole("button", { name: "Create", exact: true }).click(); const createdResponse = await created; assert.equal(createdResponse.status(), 201); channel = (await createdResponse.json()).channel;
    await source.page.getByText("fixture-channel", { exact: true }).waitFor();
  } finally {
    await pool.query("delete from communities where id=$1 and created_by=$2", [community.id, owner.id]);
    if (channel?.conversationId) await pool.query("delete from conversations where id=$1 and created_by_id=$2", [channel.conversationId, owner.id]);
  }
  return { paths, groupId: group.id, profilePhoto: true, groupPhoto: true, backgroundPhoto: true, profileEdit: true, mainMobileScreens: true };
}
