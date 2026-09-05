/**
 * End-to-end verification of the drag-to-position chat background feature.
 * Registers two fresh users, creates a DM, then exercises the background API:
 * set image + position, position-only patch, invalid input, clamping,
 * persistence in the DTO, and cross-user visibility.
 */
const BASE: string = process.env.QA_BASE ?? "http://localhost:64395";
const stamp = `${Date.now()}`.slice(-8);

async function register(displayName: string, prefix: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      displayName,
      username: `${prefix}${stamp}`,
      email: `${prefix}${stamp}@test.dev`,
      password: "Str0ng!Pass9",
      confirmPassword: "Str0ng!Pass9",
    }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(body)}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const session = cookies.map((c) => c.split(";")[0]).find((c) => c.startsWith("maddy_session="));
  if (!session) throw new Error("no session cookie returned");
  return { session, userId: body.user.id };
}

function api(session: string) {
  return async function call(path: string, opts: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { ...(opts.headers ?? {}), Cookie: session, Origin: BASE },
    } as RequestInit);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

async function main() {
  const alice = await register("Bg Alice", "bga");
  const bob = await register("Bg Bob", "bgb");
  console.log("1. registered two users:", alice.userId.slice(0, 8), bob.userId.slice(0, 8));

  const aliceApi = api(alice.session);
  const bobApi = api(bob.session);

  const start = await aliceApi("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: bob.userId }),
  });
  const convId = start.body?.conversation?.id ?? start.body?.id;
  console.log("2. started DM:", start.status, convId?.slice(0, 8));

  const tinyPng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  let r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundStyle: tinyPng, backgroundOpacity: 80, backgroundPositionX: 20, backgroundPositionY: 75 }),
  });
  console.log("3. set image + position (expect 20/75):", r.status, r.body?.backgroundPositionX, r.body?.backgroundPositionY);

  r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundPositionX: 90, backgroundPositionY: 10 }),
  });
  console.log("4. position-only patch (expect 90/10):", r.status, r.body?.backgroundPositionX, r.body?.backgroundPositionY);

  r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundPositionX: "abc" }),
  });
  console.log("5. invalid position rejected (expect 422):", r.status);

  r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundPositionX: 500, backgroundPositionY: -40 }),
  });
  console.log("6. out-of-range clamped (expect 100/0):", r.status, r.body?.backgroundPositionX, r.body?.backgroundPositionY);

  const detail = await aliceApi(`/api/conversations/${convId}`);
  const d = detail.body?.conversation;
  console.log("7. persisted in detail DTO:", JSON.stringify({
    x: d?.backgroundPositionX, y: d?.backgroundPositionY,
    opacity: d?.backgroundOpacity, hasImage: !!d?.backgroundStyle,
  }));

  const detailBob = await bobApi(`/api/conversations/${convId}`);
  const db2 = detailBob.body?.conversation;
  console.log("8. peer sees same background:", JSON.stringify({ x: db2?.backgroundPositionX, y: db2?.backgroundPositionY }));

  // Re-set the image and confirm persistence while a style is active
  r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundStyle: tinyPng, backgroundPositionX: 33, backgroundPositionY: 66 }),
  });
  const detail2 = (await aliceApi(`/api/conversations/${convId}`)).body?.conversation;
  console.log("8b. persisted with image active:", JSON.stringify({
    x: detail2?.backgroundPositionX, y: detail2?.backgroundPositionY, hasImage: !!detail2?.backgroundStyle,
  }));

  r = await aliceApi(`/api/conversations/${convId}/background`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backgroundStyle: null, backgroundOpacity: 100, backgroundPositionX: 50, backgroundPositionY: 50 }),
  });
  console.log("9. reset:", r.status, "x/y reset to:", r.body?.backgroundPositionX ?? "(null ok)");

  console.log("\nALL CHECKS COMPLETE");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
