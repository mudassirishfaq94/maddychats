import assert from "node:assert/strict";
import sharp from "sharp";

/** Uses only fixture-owned users and a selected audience; never broadcasts to real users. */
export async function testStatusPhoto(base, pool, owner, peer, source, recipient, unrelatedCookie) {
  let status; let storedPath;
  const png = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#0F4C75" } }).png().toBuffer();
  const upload = async (bytes, name, type, cookie = source.cookies) => {
    const form = new FormData();
    form.append("file", new File([bytes], name, { type }));
    form.append("privacy", "selected"); form.append("selectedUserIds", JSON.stringify([peer.id]));
    return fetch(base + "/api/status", { method: "POST", headers: { Origin: base, Cookie: cookie }, body: form });
  };
  try {
    assert.equal((await upload(png, "photo.png", "image/png", "")).status, 401);
    assert.equal((await upload(Buffer.from("<svg/>"), "fake.png", "image/png")).status, 422);
    assert.equal((await upload(Buffer.from("video"), "video.mp4", "video/mp4")).status, 422);
    await source.page.goto(base + "/app/status");
    await source.page.getByRole("button", { name: "Add photo status", exact: true }).click();
    await source.page.locator('input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from("UNTRUSTED_TRAILING_CONTENT")]) });
    await source.page.getByPlaceholder("Add a caption (optional)").fill("Verified photo status");
    await source.page.locator("select").selectOption("selected");
    await source.page.getByPlaceholder("Search people").fill(peer.username);
    await source.page.getByRole("button", { name: peer.username, exact: true }).click();
    const publishing = source.page.waitForResponse(r => r.url().endsWith("/api/status") && r.request().method() === "POST");
    await source.page.getByRole("button", { name: "Share status", exact: true }).click();
    const published = await publishing;
    assert.equal(published.status(), 201);
    status = (await published.json()).status;
    assert.equal(status.type, "image");
    const [stored] = (await pool.query("select media_path,media_mime_type,privacy,expires_at from statuses where id=$1 and user_id=$2", [status.id, owner.id])).rows;
    storedPath = stored.media_path;
    assert(stored.media_path.endsWith(".webp")); assert.equal(stored.media_mime_type, "image/webp"); assert.equal(stored.privacy, "selected");
    const media = await fetch(base + status.mediaUrl, { headers: { Cookie: recipient.cookies } });
    assert.equal(media.status, 200);
    const bytes = Buffer.from(await media.arrayBuffer());
    assert.equal((await sharp(bytes).metadata()).format, "webp");
    assert(!bytes.includes(Buffer.from("UNTRUSTED_TRAILING_CONTENT")));
    assert.equal((await fetch(base + status.mediaUrl)).status, 401);
    assert.equal((await fetch(base + status.mediaUrl, { headers: { Cookie: unrelatedCookie } })).status, 404);
    await recipient.page.goto(base + "/app/status");
    await recipient.page.getByRole("button", { name: new RegExp(owner.username) }).click();
    await recipient.page.getByRole("img", { name: "Verified photo status", exact: true }).waitFor();
    await recipient.page.waitForFunction(() => [...document.images].some(image => image.alt === "Verified photo status" && image.complete && image.naturalWidth > 0));
    await pool.query("update statuses set expires_at=now()-interval '1 second' where id=$1 and user_id=$2", [status.id, owner.id]);
    assert.equal((await fetch(base + status.mediaUrl, { headers: { Cookie: recipient.cookies } })).status, 404);
    return { photoStatus: true, statusAudience: true, statusExpiry: true, statusReconstruction: true };
  } finally {
    if (status) {
      const deleted = await fetch(base + "/api/status/" + status.id, { method: "DELETE", headers: { Origin: base, Cookie: source.cookies } });
      assert.equal(deleted.status, 200);
      await pool.query("delete from stored_uploads where path in (select $1::text) and path like 'statuses/%'", [storedPath]);
    }
  }
}
