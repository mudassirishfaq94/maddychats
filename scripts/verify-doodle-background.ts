/**
 * Live verification: custom doodle background styles ("doodle:<sets>:<ink>:<base>:<size>")
 * round-trip through the conversations/[id]/background PATCH endpoint and are
 * rejected when malformed.
 */
const DOODLE_BASE = process.env.QA_BASE ?? "http://localhost:64395";
const doodleStamp = `${Date.now()}`.slice(-8);

async function doodleRegister(displayName: string, prefix: string) {
  const res = await fetch(`${DOODLE_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: DOODLE_BASE },
    body: JSON.stringify({
      displayName,
      username: `${prefix}${doodleStamp}`,
      email: `${prefix}${doodleStamp}@test.dev`,
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

function doodleApi(session: string) {
  return async function call(path: string, opts: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fetch(DOODLE_BASE + path, {
      ...opts,
      headers: { ...(opts.headers ?? {}), Cookie: session, Origin: DOODLE_BASE },
    } as RequestInit);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

async function doodleMain() {
  const alice = await doodleRegister("Doodle Alice", "dga");
  const bob = await doodleRegister("Doodle Bob", "dgb");
  const aliceApi = doodleApi(alice.session);
  const bobApi = doodleApi(bob.session);

  const start = await aliceApi("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: bob.userId }),
  });
  const convId = start.body?.conversation?.id ?? start.body?.id;
  console.log("1. DM created:", start.status);

  async function patchBg(payload: object) {
    return aliceApi(`/api/conversations/${convId}/background`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // 2. Valid custom doodle style (mixed sets, custom colors, larger size)
  let r = await patchBg({ backgroundStyle: "doodle:classic,playful:#22d3ee:#101828:1.4", backgroundOpacity: 100 });
  console.log("2. set custom doodle (expect 200):", r.status, JSON.stringify(r.body));

  // 3. Detail DTO returns the style intact
  const detail = (await aliceApi(`/api/conversations/${convId}`)).body?.conversation;
  console.log("3. persisted style:", detail?.backgroundStyle);

  // 4. All-sets variant
  r = await patchBg({ backgroundStyle: "doodle:all:#fbbf24:#3b0764:0.8" });
  console.log("4. all-sets variant (expect 200):", r.status);

  // 5. Malformed styles rejected
  for (const bad of [
    "doodle:nope:#ffffff:#1b2a38:1",   // bad set
    "doodle:all:red:#1b2a38:1",        // bad ink color
    "doodle:all:#ffffff:#1b2a38:9",    // size out of range
    "doodle:all:#ffffff:#1b2a38",      // missing field
  ]) {
    r = await patchBg({ backgroundStyle: bad });
    console.log(`5. reject "${bad.slice(0, 32)}..." (expect 422):`, r.status);
  }

  // 6. Peer sees the same doodle style
  const peerDetail = (await bobApi(`/api/conversations/${convId}`)).body?.conversation;
  console.log("6. peer sees style:", peerDetail?.backgroundStyle);

  // 7. Bubble theme coordination: base color hue drives --bubble-* vars (client-side; just confirm style survives)
  r = await patchBg({ backgroundStyle: "doodle:all:#ffffff:#1b2a38:1", backgroundOpacity: 100 });
  console.log("7. reset to default doodles-style:", r.status);

  // 8. Legacy preset still works alongside
  r = await patchBg({ backgroundStyle: "dots", backgroundOpacity: 20 });
  console.log("8. legacy preset still accepted:", r.status);

  console.log("\nALL DOODLE CHECKS COMPLETE");
}

doodleMain().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
