import assert from "node:assert/strict";
import sharp from "sharp";

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
  const background = await fetch(base + `/api/conversations/${group.id}/background`, { method: "PATCH", headers: { Origin: base, Cookie: source.cookies }, body: form() });
  assert.equal(background.status, 200); const style = (await background.json()).backgroundStyle;
  assert(style.startsWith("data:image/webp;base64,"));
  assert.equal((await sharp(Buffer.from(style.split(",")[1], "base64")).metadata()).format, "webp");
  await source.page.setViewportSize({ width: 320, height: 740 });
  for (const screen of ["/app", "/app/chats", "/app/people", "/app/communities", "/app/status", "/app/profile", "/app/settings", "/app/starred"]) {
    const page = await source.page.goto(base + screen); assert.equal(page.status(), 200, screen);
    assert(!await source.page.getByText("Application error: a client-side exception has occurred", { exact: false }).count());
    assert(await source.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Mobile overflow: ${screen}`);
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
