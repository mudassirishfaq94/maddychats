/** Destructive tests restricted to a named disposable loopback database. */
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdir, writeFile, unlink, rmdir, readdir, cp } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID, generateKeyPairSync, createHash, privateDecrypt, constants } from "node:crypto";
import { watch } from "node:fs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import sharp from "sharp";
import { hashPassword } from "../src/server/password";

async function main() {
  const url = process.env.ITEM456_TEST_DATABASE_URL;
  assert(url, "Set ITEM456_TEST_DATABASE_URL to loopback /items456_quality_test");
  const parsed = new URL(url);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname === "/items456_quality_test", "Refusing a non-test database");
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const sql = new Pool({ connectionString: url });
  const uploadDir = resolve(".next/standalone/server/uploads");
  const testFiles: string[] = [];
  let server: ChildProcess | undefined;
  let scannerReply = "stream: OK\0";
  let scans = 0;
  const scanner = createServer((socket) => {
    let received = Buffer.alloc(0); let command = false; const chunks: Buffer[] = [];
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (!command) {
        if (received.length < 10) return;
        assert.equal(received.subarray(0, 10).toString(), "zINSTREAM\0"); command = true; received = received.subarray(10);
      }
      while (received.length >= 4) {
        const length = received.readUInt32BE(0); if (received.length < length + 4) return;
        if (!length) { scans++; socket.end(Buffer.concat(chunks).includes(Buffer.from("TEST_INFECTED")) ? "stream: test FOUND\0" : scannerReply); return; }
        chunks.push(received.subarray(4, 4 + length)); received = received.subarray(4 + length);
      }
    });
  });
  try {
    // Next standalone omits static/public assets; mirror the Docker image.
    await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
    await cp(resolve("public"), resolve(".next/standalone/public"), { recursive: true });
    await admin.query("DROP DATABASE IF EXISTS items456_quality_test WITH (FORCE)");
    await admin.query("CREATE DATABASE items456_quality_test");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    const password = "Isolated456Password9"; const hash = await hashPassword(password);
    const account = async (name: string) => (await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id,username", [name, `${name}@example.invalid`, hash])).rows[0];
    const alice = await account("item456_alice"), bob = await account("item456_bob");
    const conversation = (await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation.id, alice.id, bob.id]);
    await sql.query("insert into messages(conversation_id,sender_id,text,created_at) select $1,$2,'lab-history-'||n,now()-n*interval '1 minute' from generate_series(1,500) n", [conversation.id, alice.id]);
    scanner.listen(0, "127.0.0.1"); await once(scanner, "listening");
    const base = "http://127.0.0.1:3110";
    const secret = "items456-only-disposable-signing-secret-at-least-thirty-two-characters";
    async function start(enforce = false) {
      let output = "";
      server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { windowsHide: true, stdio: "pipe", env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url, HOSTNAME: "127.0.0.1", PORT: "3110", CLIENT_URL: base, JWT_SECRET: secret, CRON_SECRET: "item456-cron", HEALTHCHECK_SECRET: "item456-health", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: String((scanner.address() as { port: number }).port), CSP_ENFORCE: enforce ? "1" : "0", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", VAPID_PRIVATE_KEY: "", FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
      server.stdout?.on("data", (data) => output += data); server.stderr?.on("data", (data) => output += data);
      let ready = false;
      for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${base}/api/health`)).status === 204; } catch { /* startup */ } if (ready || server.exitCode !== null) break; await sleep(200); }
      assert(ready, output);
    }
    async function stop() { if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server, "exit"); server.kill(); await stopped; } }
    const api = (path: string, cookie = "", method = "GET", body?: unknown, extra: Record<string, string> = {}) => fetch(`${base}${path}`, { method, headers: { cookie, origin: base, "content-type": "application/json", ...extra }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const cookies = (response: Response) => response.headers.getSetCookie().filter((cookie) => /^(maddy_session|maddy_refresh)=/.test(cookie)).map((cookie) => cookie.split(";")[0]).join("; ");
    const part = (cookie: string, name: string) => cookie.split("; ").find((value) => value.startsWith(`${name}=`))!;
    const login = async (username: string) => { const res = await api("/api/auth/login", "", "POST", { identifier: username, password }); assert.equal(res.status, 200); return cookies(res); };
    await start();
    let aliceCookie = await login(alice.username); const bobCookie = await login(bob.username);
    // A first contact gets exactly one encrypted introduction and a durable
    // approval notification; server consent survives retries and concurrency.
    const requestSender = await account("item456_request_sender");
    const requestRecipient = await account("item456_request_recipient");
    const senderCookie = await login(requestSender.username), recipientCookie = await login(requestRecipient.username);
    const requestResponse = await api("/api/conversations", senderCookie, "POST", { userId: requestRecipient.id });
    assert.equal(requestResponse.status, 201);
    const requestConversation = (await requestResponse.json()).conversation;
    assert.equal(requestConversation.awaitingApproval, true);
    const requestPath = `/api/conversations/${requestConversation.id}`;
    const permissions = await (await api(`/api/e2ee/peers?conversationId=${requestConversation.id}&allowMessageRequest=1`, senderCookie)).json();
    assert.equal(permissions.allowInitialRequest, true);
    assert.equal((await api(`${requestPath}/messages`, senderCookie, "POST", { text: "never plaintext" })).status, 422);
    assert.equal((await api(`${requestPath}/messages`, recipientCookie, "POST", { text: "ciphertext-recipient", encrypted: true })).status, 403);
    const candidates = [randomUUID(), randomUUID()];
    const attempts = await Promise.all(candidates.map(clientMessageId => api(`${requestPath}/messages`, senderCookie, "POST", { text: `ciphertext-${clientMessageId}`, encrypted: true, clientMessageId })));
    assert.deepEqual(attempts.map(response => response.status).sort(), [201, 403]);
    const winningIndex = attempts.findIndex(response => response.status === 201);
    const introduction = (await attempts[winningIndex].json()).message;
    assert.equal(introduction.encrypted, true);
    const retry = await api(`${requestPath}/messages`, senderCookie, "POST", { text: `ciphertext-${candidates[winningIndex]}`, encrypted: true, clientMessageId: candidates[winningIndex] });
    assert.equal(retry.status, 200); assert.equal((await retry.json()).message.id, introduction.id);
    assert.equal((await sql.query("select count(*)::int as n from messages where conversation_id=$1", [requestConversation.id])).rows[0].n, 1);
    const requestNotifications = (await sql.query("select data from notifications where user_id=$1 and data->>'messageId'=$2", [requestRecipient.id, introduction.id])).rows;
    assert.equal(requestNotifications.length, 1); assert.match(requestNotifications[0].data.preview, /Message request/);
    const inbox = await (await api("/api/conversations", recipientCookie)).json();
    assert.equal(inbox.conversations.find((entry: { id: string }) => entry.id === requestConversation.id).requestPending, true);
    assert.equal((await (await api(`${requestPath}/messages`, recipientCookie)).json()).messages[0].id, introduction.id);
    await api(`${requestPath}/read`, recipientCookie, "POST");
    assert.equal((await sql.query("select count(*)::int as n from message_reads where message_id=$1", [introduction.id])).rows[0].n, 0);
    assert.equal((await api(`${requestPath}/scheduled`, senderCookie, "POST", { text: "ciphertext", encrypted: true, scheduledFor: new Date(Date.now()+60000).toISOString() })).status, 403);
    const pendingUpload = new FormData(); pendingUpload.set("conversationId", requestConversation.id); pendingUpload.set("encrypted", "true"); pendingUpload.set("files", new File(["ciphertext"], "encrypted.bin"));
    assert.equal((await fetch(`${base}/api/upload/message`, { method: "POST", headers: { cookie: senderCookie, origin: base }, body: pendingUpload })).status, 403);
    assert.equal((await api(`${requestPath}/accept`, recipientCookie, "POST")).status, 200);
    for (const cookie of [senderCookie, recipientCookie]) assert.equal((await api(`${requestPath}/messages`, cookie, "POST", { text: `ciphertext-${randomUUID()}`, encrypted: true, clientMessageId: randomUUID() })).status, 201);
    // Acceptance between the route's pending snapshot and its transaction
    // must not lose the introduction notification.
    const raceConversation = (await (await api("/api/conversations", senderCookie, "POST", { userId: bob.id })).json()).conversation;
    const gateConnection = await sql.connect();
    const gateName = `message-request:${raceConversation.id}`;
    let racingSend: Promise<Response>;
    await gateConnection.query("select pg_advisory_lock(hashtextextended($1,0))", [gateName]);
    try {
      racingSend = api(`/api/conversations/${raceConversation.id}/messages`, senderCookie, "POST", { text: "ciphertext-acceptance-race", encrypted: true, clientMessageId: randomUUID() });
      let waiting = false;
      for (let i=0;i<40;i++) {
        waiting = (await gateConnection.query("select exists(select 1 from pg_locks where locktype='advisory' and not granted and database=(select oid from pg_database where datname=current_database())) as waiting")).rows[0].waiting;
        if (waiting) break; await sleep(50);
      }
      assert(waiting, "The send must reach the consent transaction before acceptance");
      assert.equal((await api(`/api/conversations/${raceConversation.id}/accept`, bobCookie, "POST")).status, 200);
    } finally {
      await gateConnection.query("select pg_advisory_unlock(hashtextextended($1,0))", [gateName]);
      gateConnection.release();
    }
    const racedResponse = await racingSend!; assert.equal(racedResponse.status, 201);
    const racedMessage = (await racedResponse.json()).message;
    assert.equal((await sql.query("select count(*)::int as n from notifications where user_id=$1 and data->>'messageId'=$2", [bob.id,racedMessage.id])).rows[0].n, 1, "Acceptance racing the introduction must retain its notification");
    // Device IDs are browser-scoped, so separate accounts may share the ID.
    await sql.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key,trusted_at) values($1,'shared-browser','fixture-alice','fixture',now()),($2,'shared-browser','fixture-bob','fixture',now())", [alice.id, bob.id]);
    const sharedPeers = await (await api(`/api/e2ee/peers?conversationId=${conversation.id}&deviceId=shared-browser`, aliceCookie)).json();
    assert.equal(sharedPeers.peers.find((peer: { userId: string }) => peer.userId === alice.id).devices.length, 0, "Exclude only the requesting account's own device");
    assert.equal(sharedPeers.peers.find((peer: { userId: string }) => peer.userId === bob.id).devices[0].deviceId, "shared-browser", "Keep the other account's key on the same browser");
    await sql.query("delete from e2ee_keys where device_id='shared-browser'");
    // Real RSA proof: a login cookie and an untrusted device cannot approve keys.
    const sourcePair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const targetPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sourcePublic = sourcePair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const targetPublic = targetPair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const targetFingerprint = createHash("sha256").update(targetPublic).digest("hex");
    await sql.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key,trusted_at) values($1,'approval-source',$3,'fixture',now()),($1,'approval-target',$4,'fixture',null),($2,'approval-foreign',$4,'fixture',null)", [alice.id, bob.id, sourcePublic, targetPublic]);
    const challengeBody = { action: "challenge", sourceDeviceId: "approval-source", targetDeviceId: "approval-target", targetFingerprint };
    assert.equal((await api("/api/e2ee/devices/approve", bobCookie, "POST", challengeBody)).status, 403, "Cross-account approval is denied");
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { ...challengeBody, sourceDeviceId: "approval-target" })).status, 403, "Pending devices cannot approve themselves");
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { ...challengeBody, targetFingerprint: "wrong" })).status, 409, "Bind approval to the fingerprint verified by the user");
    const challengeResponse = await api("/api/e2ee/devices/approve", aliceCookie, "POST", challengeBody);
    assert.equal(challengeResponse.status, 200);
    const challenge = await challengeResponse.json();
    const proof = privateDecrypt({ key: sourcePair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(challenge.encryptedChallenge, "base64")).toString();
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { action: "approve", token: challenge.token, proof: "a".repeat(43) })).status, 403, "A cookie alone cannot forge the trusted private-key proof");
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { action: "approve", token: challenge.token, proof })).status, 200);
    assert((await sql.query("select trusted_at from e2ee_keys where user_id=$1 and device_id='approval-target'", [alice.id])).rows[0].trusted_at);
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { action: "approve", token: challenge.token, proof })).status, 409, "Approval proofs are single-use");
    const revokedChallenge = await (await api("/api/e2ee/devices/approve", aliceCookie, "POST", challengeBody)).json();
    const revokedProof = privateDecrypt({ key: sourcePair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(revokedChallenge.encryptedChallenge, "base64")).toString();
    await sql.query("update e2ee_keys set trusted_at=null where user_id=$1 and device_id='approval-source'", [alice.id]);
    assert.equal((await api("/api/e2ee/devices/approve", aliceCookie, "POST", { action: "approve", token: revokedChallenge.token, proof: revokedProof })).status, 403, "Recheck source trust when consuming proof");
    await sql.query("delete from e2ee_keys where device_id like 'approval-%'");
    const png = await sharp({ create: { width: 40, height: 50, channels: 3, background: "blue" } }).png().toBuffer();
    const upload = (bytes: Buffer, cookie = aliceCookie, path = "/api/upload/avatar", fields: Record<string, string> = {}) => {
      const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" })); for (const [key, value] of Object.entries(fields)) form.set(key, value);
      return fetch(`${base}${path}`, { method: "POST", body: form, headers: { cookie, origin: base }, signal: AbortSignal.timeout(20000) });
    };
    assert.equal((await upload(Buffer.from("fake png"))).status, 422);
    assert.equal((await upload(Buffer.concat([png, Buffer.from("TEST_INFECTED")]))).status, 422);
    scannerReply = "stream: scanner ERROR\0"; assert.equal((await upload(png)).status, 503); scannerReply = "stream: OK\0";
    assert.equal((await sql.query("select count(*)::int as n from stored_uploads")).rows[0].n, 0, "Rejected media is never stored");
    const avatarsDir = join(uploadDir, "avatars"); await mkdir(avatarsDir, { recursive: true });
    const beforeInventoryFailure = await readdir(avatarsDir);
    const inventoryFailureWrites: string[] = [];
    const avatarWatcher = watch(avatarsDir, { persistent: false }, (_event, name) => inventoryFailureWrites.push(name?.toString() || "unknown"));
    await sql.query("alter table stored_uploads rename to item456_inventory_paused");
    try {
      assert.equal((await upload(png)).status, 500);
      await sleep(50);
      assert.equal(inventoryFailureWrites.length, 0, "Inventory failure must reject before any storage write");
      assert.deepEqual(await readdir(avatarsDir), beforeInventoryFailure, "Inventory failure must not write untracked bytes");
    } finally { avatarWatcher.close(); await sql.query("alter table item456_inventory_paused rename to stored_uploads"); }
    const valid = await upload(png); assert.equal(valid.status, 200); const avatar = await valid.json();
    testFiles.push(avatar.attachment.path); assert.equal(avatar.attachment.mimeType, "image/webp");
    assert.equal((await api(avatar.user.avatarUrl, aliceCookie)).status, 200); assert(scans >= 4);
    const large = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); controller.close(); } });
    const oversized = await fetch(`${base}/api/upload/avatar`, { method: "POST", headers: { cookie: aliceCookie, origin: base, "content-type": "multipart/form-data; boundary=fixture" }, body: large, duplex: "half" } as RequestInit);
    assert.equal(oversized.status, 413, "Chunked multipart bodies enforce the real byte limit");
    const background = await api(`/api/conversations/${conversation.id}/background`, aliceCookie, "PATCH", { backgroundStyle: "data:image/png;base64,PHNjcmlwdD4=" }); assert.equal(background.status, 422, "JSON cannot bypass image processing");
    assert.equal((await upload(png, aliceCookie, "/api/status", { privacy: "selected", selectedUserIds: "{}" })).status, 422);
    const group = (await sql.query("insert into conversations(type,name,created_by_id,admin_only_messaging) values('group','Upload boundary',$1,true) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')", [group.id, alice.id, bob.id]);
    const envelope = new FormData(); envelope.set("conversationId", group.id); envelope.set("encrypted", "true");
    envelope.set("files", new File([new Uint8Array(50)], "file.png", { type: "application/octet-stream" })); envelope.set("keys", "opaque-test-key"); envelope.set("origTypes", "image/png");
    assert.equal((await fetch(`${base}/api/upload/message`, { method: "POST", headers: { cookie: bobCookie, origin: base }, body: envelope })).status, 403, "Attachments obey admin-only group messaging");

    // Cleanup removes orphan/expired bytes, preserves live and recent references, and retries failures.
    const fixture = async (name: string, age = "2 days", directory = false) => {
      const relative = `files/item456-${randomUUID()}-${name}.bin`; const absolute = join(uploadDir, relative);
      await mkdir(resolve(uploadDir, "files"), { recursive: true });
      if (directory) await mkdir(absolute); else await writeFile(absolute, "retention-fixture");
      testFiles.push(relative); await sql.query("insert into stored_uploads(path,created_at) values($1,now()-$2::interval)", [relative, age]); return relative;
    };
    const orphan = await fixture("orphan"), recent = await fixture("recent", "1 minute"), live = await fixture("live"), expired = await fixture("expired"), failure = await fixture("retry", "2 days", true);
    const message = (await sql.query("select id from messages order by created_at desc limit 1")).rows[0];
    await sql.query("insert into message_attachments(message_id,original_name,stored_name,mime_type,size,path) values($1,'live.bin',$2,'application/octet-stream',17,$3)", [message.id, live.split("/")[1], live]);
    await sql.query("insert into statuses(user_id,type,media_path,media_mime_type,expires_at) values($1,'image',$2,'image/webp',now()-interval '2 days')", [alice.id, expired]);
    const cron = () => api("/api/cron/process-scheduled", "", "GET", undefined, { authorization: "Bearer item456-cron" });
    const firstCleanup = await (await cron()).json(); assert.equal(firstCleanup.retention.removed, 2); assert.equal(firstCleanup.retention.failed, 1);
    for (const path of [recent, live, failure]) assert.equal((await sql.query("select count(*)::int as n from stored_uploads where path=$1", [path])).rows[0].n, 1);
    for (const path of [orphan, expired]) assert.equal((await sql.query("select count(*)::int as n from stored_uploads where path=$1", [path])).rows[0].n, 0);
    await rmdir(join(uploadDir, failure));
    assert.equal((await (await cron()).json()).retention.removed, 1, "Failed deletion is retried");

    const access = part(aliceCookie, "maddy_session").split("=")[1];
    const claims = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString()); assert.equal(claims.exp - claims.iat, 900);
    const oldRefresh = part(aliceCookie, "maddy_refresh");
    const refreshes = await Promise.all([api("/api/auth/me", oldRefresh), api("/api/auth/me", oldRefresh)]);
    assert.deepEqual(refreshes.map((res) => res.status), [200, 200]);
    const firstRotated = cookies(refreshes[0]); const secondRotated = cookies(refreshes[1]);
    assert.equal(part(firstRotated, "maddy_refresh"), part(secondRotated, "maddy_refresh"), "Concurrent refreshes converge on the same successor");
    assert.notEqual(part(firstRotated, "maddy_refresh"), oldRefresh);
    const stored = (await sql.query("select * from device_sessions where id=$1", [claims.sid])).rows[0]; assert(!stored.refresh_hash.includes(oldRefresh.split(".")[1])); assert.equal(Number(stored.auth_time), claims.authTime);
    await sql.query("update device_sessions set previous_valid_until=now()-interval '1 second' where id=$1", [claims.sid]);
    assert.equal((await api("/api/auth/me", oldRefresh)).status, 401); assert.equal((await api("/api/auth/me", firstRotated)).status, 401, "Replay revokes the device's access token too");
    aliceCookie = await login(alice.username); const secondDevice = await login(alice.username);
    const devices = await (await api("/api/privacy/devices", aliceCookie)).json(); const sessions = [...devices.unboundSessions, ...devices.devices.flatMap((device: { sessions: { current: boolean }[] }) => device.sessions)]; assert.equal(sessions.length, 2); assert.equal(sessions.filter((session: { current: boolean }) => session.current).length, 1); assert(!JSON.stringify(devices).includes("refreshHash"));
    const bobDevices = await (await api("/api/privacy/devices", bobCookie)).json();
    assert.equal((await api("/api/privacy/devices", aliceCookie, "DELETE", { id: bobDevices.currentSessionId })).status, 404);
    assert.equal((await api("/api/privacy/devices", aliceCookie, "DELETE", { allOthers: true }, { origin: "https://outside.invalid", "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await api("/api/privacy/devices", aliceCookie, "DELETE", { allOthers: true })).status, 200);
    assert.equal((await api("/api/auth/me", secondDevice)).status, 401); assert.equal((await api("/api/auth/me", aliceCookie)).status, 200);
    assert.equal((await api("/api/auth/me", part(secondDevice, "maddy_refresh"))).status, 401, "Revoked devices cannot refresh");
    const expiring = await login(alice.username);
    const expiringClaims = JSON.parse(Buffer.from(part(expiring, "maddy_session").split("=")[1].split(".")[1], "base64url").toString());
    const realtime = await fetch(`${base}/api/realtime/stream`, { headers: { cookie: expiring }, signal: AbortSignal.timeout(15000) });
    assert.equal(realtime.status, 200); const realtimeReader = realtime.body!.getReader();
    await sql.query("update device_sessions set expires_at=now()-interval '1 second' where id=$1", [expiringClaims.sid]);
    while (!(await realtimeReader.read()).done) { /* revoked stream must end without waiting for its 280-second lifetime */ }
    realtimeReader.releaseLock();
    assert.equal((await api("/api/auth/me", expiring)).status, 401);
    assert.equal((await api("/api/auth/me", part(expiring, "maddy_refresh"))).status, 401, "Absolute device expiry cannot be renewed");
    await sql.query("update users set suspended_at=now() where id=$1", [bob.id]);
    assert.equal((await api("/api/auth/me", part(bobCookie, "maddy_refresh"))).status, 401, "Suspension blocks refresh");
    await sql.query("update users set suspended_at=null,token_invalid_before_at=now()+interval '1 second' where id=$1", [bob.id]);
    assert.equal((await api("/api/auth/me", part(bobCookie, "maddy_refresh"))).status, 401, "Account revocation blocks refresh");
    // A cookie renewal never turns an old login into fresh authentication.
    process.env.JWT_SECRET = secret;
    const { signSessionToken } = await import("../src/server/jwt");
    const activeClaims = JSON.parse(Buffer.from(part(aliceCookie, "maddy_session").split("=")[1].split(".")[1], "base64url").toString());
    const oldAccess = `maddy_session=${await signSessionToken(alice.id, alice.username, Date.now() - 360000, 0, activeClaims.sid)}`;
    assert.equal((await api("/api/privacy/devices", oldAccess, "DELETE", { allOthers: true })).status, 403, "Old authentication must be reconfirmed");
    const identity = await api("/api/auth/me", oldAccess);
    assert.equal(identity.status, 200);
    assert.equal(identity.headers.getSetCookie().length, 0, "Valid identity reads do not replace session cookies");
    const renewedOld = oldAccess;
    assert.equal((await api("/api/privacy/devices", renewedOld, "DELETE", { allOthers: true })).status, 403, "Cookie renewal does not satisfy fresh authentication");
    const page1 = await api("/login"), page2 = await api("/login"); const report1 = page1.headers.get("content-security-policy-report-only")!;
    assert(report1.includes("'strict-dynamic'")); assert.notEqual(report1, page2.headers.get("content-security-policy-report-only"));
    const html = await page1.text(); const nonce = /'nonce-([^']+)'/.exec(report1)![1]; assert(html.includes(`nonce="${nonce}"`), "Framework scripts receive the policy's server-generated nonce");
    assert.equal((await api("/api/security/csp-report", "", "POST", { "csp-report": { "effective-directive": "script-src", "document-uri": "https://private.invalid/token" } })).status, 204);
    assert((await api(`/api/conversations/${conversation.id}/messages`, aliceCookie)).headers.get("server-timing")?.includes("history;dur="));
    assert((await api("/api/conversations", aliceCookie)).headers.get("server-timing")?.includes("conversations;dur="));
    const plan = await sql.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM messages WHERE conversation_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50", [conversation.id]);
    await mkdir(resolve(".freebuff/performance"), { recursive: true });
    await writeFile(resolve(".freebuff/performance/database-lab.json"), JSON.stringify({ fixture: "500 messages; disposable local PostgreSQL", plan: plan.rows[0]["QUERY PLAN"] }, null, 2));
    await stop(); await start(true);
    assert((await api("/login")).headers.get("content-security-policy")?.includes("'strict-dynamic'"));
    if (process.env.ITEM456_BROWSER_TESTS === "1") {
      // Public routes must remain interactive without bootstrapping a private
      // chat session or a native plugin. Run under the enforced nonce policy.
      const { chromium } = await import("playwright");
      const publicBrowser = await chromium.launch({ headless: true });
      try {
        const publicContext = await publicBrowser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
        const publicPage = await publicContext.newPage();
        const requests: string[] = [], browserErrors: string[] = [];
        publicPage.on("request", request => requests.push(new URL(request.url()).pathname));
        publicPage.on("pageerror", error => browserErrors.push(error.message));
        assert.equal((await publicPage.goto(base))?.status(), 200);
        await publicPage.getByRole("button", { name: "Change theme" }).click();
        await publicPage.getByRole("menuitemradio", { name: "Dark" }).click();
        assert.equal(await publicPage.evaluate(() => document.documentElement.classList.contains("light")), false);
        const publicScriptBytes = await publicPage.evaluate(() => performance.getEntriesByType("resource")
          .filter(entry => new URL(entry.name).pathname.endsWith(".js"))
          .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).decodedBodySize, 0));
        assert(publicScriptBytes > 0 && publicScriptBytes <= 550_000, `Public JavaScript budget exceeded: ${publicScriptBytes} decoded bytes`);
        await publicPage.getByRole("link", { name: "Log in", exact: true }).last().click();
        await publicPage.waitForURL("**/login");
        await publicPage.getByLabel("Email or username", { exact: true }).waitFor({ state: "visible" });
        assert(!requests.some(path => path.startsWith("/api/e2ee/") || path === "/api/realtime/stream"), "Public navigation must not bootstrap private chat services");
        assert.deepEqual(browserErrors, [], "Public theme/login hydration must work");
      } finally { await publicBrowser.close(); }
      if (process.env.ITEM456_RECOVERY_ONLY !== "1") {
      const { profileMobile } = await import("./profile-mobile.mjs");
      const results = await profileMobile(base, aliceCookie, conversation.id, process.env.ITEM456_BROWSER_QUICK === "1");
      for (const result of results) {
        assert.equal(result.status, 200, `Mobile route ${result.path}`); assert.equal(result.horizontalOverflow, false, `Overflow at ${result.width}px on ${result.path}`);
        assert.deepEqual(result.csp.filter((event: { disposition: string }) => event.disposition === "enforce"), [], `Enforced CSP violations on ${result.path}`); assert.deepEqual(result.errors, [], `Browser errors on ${result.path}`);
        assert(result.samples.some((sample) => sample.kind === "vital"), `Web Vitals captured on ${result.path}`);
        for (const metric of ["LCP", "CLS"]) assert(result.samples.some((sample) => sample.kind === "vital" && sample.name === metric), `${metric} captured on ${result.path}`);
        if (process.env.PROFILE_BUILD === "1") assert(result.samples.some((sample) => sample.kind === "react"), `React profiling captured on ${result.path}`);
      }
      }
    }
    if (process.env.ITEM456_BROWSER_TESTS === "1") {
      const carol = await account("item456_recovery");
      const carolCookie = await login(carol.username);
      const recoveryPeer = await account("item456_recovery_peer");
      const recoveryPeerCookie = await login(recoveryPeer.username);
      const recoveryConversation = (await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [carol.id])).rows[0];
      await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [recoveryConversation.id, carol.id, recoveryPeer.id]);
      await sql.query("insert into messages(conversation_id,sender_id,text,created_at) select $1,$2,'recovery-history-'||n,now()-n*interval '1 minute' from generate_series(1,500) n", [recoveryConversation.id, carol.id]);
      assert.equal((await api("/api/e2ee/keys", recoveryPeerCookie, "POST", { deviceId: "recovery-peer", publicKey: targetPublic, encryptedPrivateKey: "test-only-backup" })).status, 200);
      const { testChatRecovery } = await import("./test-chat-recovery.mjs");
      await testChatRecovery(base, carolCookie, recoveryConversation.id);
      const introSender = await account("item456_browser_request_sender");
      const introRecipient = await account("item456_browser_request_recipient");
      const introSenderCookie = await login(introSender.username), introRecipientCookie = await login(introRecipient.username);
      const introConversation = (await (await api("/api/conversations", introSenderCookie, "POST", { userId: introRecipient.id })).json()).conversation;
      const { testMessageRequests } = await import("./test-message-requests.mjs");
      await testMessageRequests(base, introSenderCookie, introRecipientCookie, introConversation.id);
      const introRows = (await sql.query("select text,encrypted from messages where conversation_id=$1", [introConversation.id])).rows;
      assert.equal(introRows.length, 3); assert(introRows.every(row => row.encrypted && !row.text.includes("my circle")), "Only ciphertext may be stored");
    }
    assert.equal((await api("/api/auth/logout", aliceCookie, "POST")).status, 200); assert.equal((await api("/api/auth/me", aliceCookie)).status, 401);
    console.log("Items 4–6 passed: upload safety, retention retries, rotating device sessions, revocation, CSP, and profiling measurements");
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server, "exit"); server.kill(); await stopped; }
    scanner.close();
    for (const path of testFiles) { await unlink(join(uploadDir, path)).catch(() => rmdir(join(uploadDir, path)).catch(() => undefined)); }
    await sql.end(); await admin.end();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
