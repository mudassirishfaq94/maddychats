import { fixtureAppSession } from "./fixture-app-session.mjs";
/** Real HTTP/SQL checks restricted to a disposable loopback database. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { mkdir, writeFile, cp } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { SignJWT, decodeJwt } from "jose";
import { hashPassword } from "../src/server/password";
import { TOTP } from "otpauth";

async function main() {
  const url = process.env.REMAINING_TEST_DATABASE_URL;
  assert(url, "Set REMAINING_TEST_DATABASE_URL to loopback /remaining_hardening_test");
  const parsed = new URL(url);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname === "/remaining_hardening_test", "Refusing non-test database");
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const sql = new Pool({ connectionString: url });
  let server: ChildProcess | undefined;
  const streams: AbortController[] = [];
  try {
    if (process.env.REMAINING_BROWSER_TESTS === "1") {
      await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
      await cp(resolve("public"), resolve(".next/standalone/public"), { recursive: true });
    }
    await admin.query("DROP DATABASE IF EXISTS remaining_hardening_test WITH (FORCE)");
    await admin.query("CREATE DATABASE remaining_hardening_test");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    const password = "RemainingSecurePassword9", hash = await hashPassword(password);
    const account = async (name: string, role = "user") => (await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at,role) values($1,$1,$2,$3,now(),$4) returning id,username", [name, `${name}@example.invalid`, hash, role])).rows[0];
    const alice = await account("remain_alice"), bob = await account("remain_bob"), owner = await account("remain_admin", "admin"), moderator = await account("remain_mod", "moderator"), target = await account("remain_target");
    const base = "http://127.0.0.1:3111", secret = "remaining-only-disposable-secret-at-least-thirty-two-characters";
    server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { windowsHide: true, stdio: "pipe", env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url, REALTIME_DATABASE_URL: url, HOSTNAME: "127.0.0.1", PORT: "3111", CLIENT_URL: base, JWT_SECRET: secret, HEALTHCHECK_SECRET: "remaining-health", CRON_SECRET: "remaining-cron", CSP_ENFORCE: "1", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", VAPID_PRIVATE_KEY: "", RESEND_API_KEY: "", FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" } });
    let output = ""; server.stdout?.on("data", (c) => output += c); server.stderr?.on("data", (c) => output += c);
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(`${base}/api/health`)).status === 204; } catch { /* startup */ } if (ready || server.exitCode !== null) break; await sleep(200); }
    assert(ready, output);
    const api = (path: string, cookie = "", method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(base + path, { method, headers: { cookie, origin: base, "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const sessionCookie = (response: Response) => { const cookie = response.headers.getSetCookie().find((value) => value.startsWith("maddy_session="))?.split(";")[0]; assert(cookie); return cookie; };
    const login = async (name: string, mfa?: string) => {
      const response = await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: name, password }); assert.equal(response.status, 200);
      if (!mfa) { await fixtureAppSession(sql,response); return sessionCookie(response); }
      const challenge = response.headers.getSetCookie().find((value) => value.startsWith("maddy_mfa_challenge="))?.split(";")[0]; assert(challenge);
      const verified = await api("/api/auth/mfa", challenge, "POST", { code: new TOTP({ secret: mfa, algorithm: "SHA1", digits: 6, period: 30 }).generate() }); assert.equal(verified.status, 200, await verified.clone().text()); await fixtureAppSession(sql,verified); return sessionCookie(verified);
    };
    let aliceCookie = await login(alice.username);
    const bobCookie = await login(bob.username), noMfaCookie = await login(owner.username);
    const ownProfile = await api("/api/users/me", aliceCookie);
    assert.equal(ownProfile.status, 200);
    assert(ownProfile.headers.get("cache-control")?.includes("no-store"), "Private profile responses cannot be cached");

    assert.equal((await api("/api/admin/users", aliceCookie, "PATCH", { userId: target.id, action: "role", role: "admin" })).status, 403);
    assert.equal((await api("/api/admin/stats", noMfaCookie)).status, 403, "Admin reads require MFA enrollment");
    const setupPage = await api("/app/admin", noMfaCookie);
    assert.equal(setupPage.status, 200);
    const setupHtml = await setupPage.text();
    assert(setupHtml.includes("Secure your admin account") && setupHtml.includes("/app/profile#two-step-verification"));
    assert(!setupHtml.includes("Admin Dashboard v1.0"), "MFA setup screen never includes privileged admin children");
    assert.equal((await api("/api/e2ee/signal/send", aliceCookie, "POST", {})).status, 503, "Experimental send cannot bypass production policies");
    assert.equal((await api("/api/admin/users", noMfaCookie, "PATCH", { userId: target.id, action: "role", role: "moderator" })).status, 403, "Admin writes require MFA enrollment");
    const factorSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const recovery = "11111111-22222222-33333333-44444444", recoveryHash = createHash("sha256").update(recovery.replace(/-/g, "")).digest("hex");
    for (const user of [owner, moderator]) await sql.query("insert into user_2fa(user_id,secret,enabled,enabled_at,recovery_code_hashes) values($1,$2,true,now()-interval '1 hour',$3::jsonb)", [user.id, factorSecret, JSON.stringify([recoveryHash])]);
    const ownerCookie = await login(owner.username, factorSecret), modCookie = await login(moderator.username, factorSecret);
    assert.equal((await api("/api/admin/users", modCookie, "PATCH", { userId: target.id, action: "role", role: "admin" })).status, 403, "Moderator cannot escalate any role");
    assert.equal((await api(`/api/admin/users/${target.id}`, modCookie, "PATCH", { displayName: "Hijacked" })).status, 403, "Moderator cannot edit identity or password");
    assert.equal((await api("/api/admin/users", ownerCookie, "PATCH", { userId: target.id, action: "role", role: "admin" }, { origin: "https://evil.example" })).status, 403);
    const claims = decodeJwt(ownerCookie.split("=")[1]);
    const oldToken = await new SignJWT({ ...claims, authTime: Date.now() - 360000 }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(new TextEncoder().encode(secret));
    const oldCookie = `maddy_session=${oldToken}`;
    const conversation = (await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation.id, alice.id, bob.id]);
    const message = (await sql.query("insert into messages(conversation_id,sender_id,text) values($1,$2,'isolated moderation fixture') returning id", [conversation.id, alice.id])).rows[0];
    const report = (await sql.query("insert into reports(reporter_id,type,reason,target_user_id) values($1,'user','spam',$2) returning id", [alice.id, bob.id])).rows[0];
    assert.equal((await api(`/api/admin/users/${bob.id}`, oldCookie, "PATCH", { displayName: "Altered" })).status, 403);
    assert.equal((await api(`/api/admin/users/${bob.id}`, oldCookie, "DELETE", {})).status, 403);
    assert.equal((await api(`/api/admin/messages/${message.id}`, oldCookie, "DELETE", {})).status, 403);
    assert.equal((await api("/api/admin/reports", oldCookie, "PUT", { reportId: report.id, status: "resolved" })).status, 403);
    assert.equal((await api("/api/admin/users", oldCookie, "PATCH", { userId: target.id, action: "suspend", days: 7 })).status, 403, "Old access cookie alone cannot mutate administrative data");
    assert.equal((await api("/api/admin/users", oldCookie, "PATCH", { userId: target.id, action: "suspend", password, mfaCode: "invalid" })).status, 403);
    assert.equal((await api("/api/admin/users", oldCookie, "PATCH", { userId: target.id, action: "suspend", password, mfaCode: recovery, days: 7 })).status, 200);
    assert.equal((await api("/api/admin/users", oldCookie, "PATCH", { userId: target.id, action: "unsuspend", password, mfaCode: recovery })).status, 403, "Consumed recovery code cannot authorize another write");
    assert.equal((await api("/api/admin/users", ownerCookie, "PATCH", { userId: target.id, action: "unsuspend" })).status, 200);
    assert((await sql.query("select token_invalid_before_at from users where id=$1", [target.id])).rows[0].token_invalid_before_at, "Restoration must not reactivate previously revoked cookies");
    // Independent fault scenarios get a fresh attempt budget; product limits
    // stay unchanged and factor-consumption state is deliberately preserved.
    await sql.query("delete from rate_limit_buckets where key=$1", [`admin-proof:${owner.id}`]);
    await sql.query("alter table admin_audit_log rename to unavailable_audit_log");
    try { assert.equal((await api("/api/admin/users", ownerCookie, "PATCH", { userId: target.id, action: "role", role: "moderator" })).status, 500); }
    finally { await sql.query("alter table unavailable_audit_log rename to admin_audit_log"); }
    assert.equal((await sql.query("select role from users where id=$1", [target.id])).rows[0].role, "user", "Audit failure must roll back privilege changes");
    const audit = (await sql.query("select id from admin_audit_log limit 1")).rows[0];
    await assert.rejects(sql.query("update admin_audit_log set action='forged' where id=$1", [audit.id]), /append-only/);
    await assert.rejects(sql.query("delete from admin_audit_log where id=$1", [audit.id]), /append-only/);
    await assert.rejects(sql.query("truncate admin_audit_log"), /append-only/);
    assert.equal((await api(`/api/admin/users/${target.id}`, ownerCookie, "DELETE", {})).status, 200, "Deleting a subject retains audit evidence through FK cleanup");
    assert((await sql.query("select details from admin_audit_log where action='user_deleted' and details->>'deletedUserId'=$1", [target.id])).rows.length);
    assert.equal((await api("/api/admin/reports", ownerCookie, "PUT", { reportId: report.id, status: "not-a-status" })).status, 422);
    assert.equal((await api("/api/admin/reports", ownerCookie, "PUT", { reportId: report.id, status: "resolved" })).status, 200);
    const metadataOnly=await api(`/api/admin/messages?q=${message.id}`,ownerCookie);
    assert.equal(metadataOnly.status,200);
    const metadataBody=await metadataOnly.json();
    assert.equal(metadataBody.messages.length,1);
    assert(!("text" in metadataBody.messages[0]),"Admin moderation must never return private message content");
    assert.equal((await api(`/api/admin/messages/${message.id}`, ownerCookie, "DELETE", {})).status, 200);
    assert((await sql.query("select deleted_at from messages where id=$1", [message.id])).rows[0].deleted_at);
    assert.equal((await sql.query("select count(*)::int n from realtime_events where payload->>'type'='message:deleted' and payload->'message'->>'id'=$1", [message.id])).rows[0].n, 2, "Moderation and recipient notifications commit together");
    const htmlName = "<img src=x onerror='window.__circloXss=1'>";
    await sql.query("update users set display_name=$1 where id=$2", [htmlName, bob.id]);
    if (process.env.REMAINING_BROWSER_TESTS === "1") {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await context.addCookies([{ name: "maddy_session", value: ownerCookie.split("=")[1], url: base, httpOnly: true, sameSite: "Lax" }]);
        const page = await context.newPage();
        for (const path of ["/app/admin", "/app/admin/users", "/app/admin/reports", "/app/admin/messages", "/app/admin/audit", "/app/admin/activity", "/app/admin/security", "/app/admin/storage"]) {
          const errors: string[] = []; const record = (error: Error) => errors.push(error.message);
          page.on("pageerror", record);
          const response = await page.goto(base + path, { waitUntil: "load" });
          assert.equal(response?.status(), 200);
          await page.getByRole("heading", { level: 1 }).waitFor();
          if (["users", "reports", "messages"].some(segment => path.endsWith("/" + segment))) await page.getByRole("main").getByText("Administrative changes require two-factor authentication and a recent sign-in.").waitFor();
          if (path.endsWith("users")) {
            await page.getByText(htmlName, { exact: true }).waitFor();
            assert.equal(await page.locator('img[src="x"]').count(), 0, "Profile markup is rendered as text");
            assert.equal(await page.evaluate(() => "__circloXss" in window), false, "Profile payload never executes");
          }
          assert.deepEqual(errors, [], `Admin browser errors on ${path}`);
          page.off("pageerror", record);
        }
        for (const [path, endpoint, heading] of [["/app/admin", "/api/admin/stats", "Dashboard Overview"], ["/app/admin/storage", "/api/admin/storage", "Storage Dashboard"], ["/app/admin/audit", "/api/admin/audit-log", "Audit Log"], ["/app/admin/security", "/api/admin/security/login-history", "Security & Retention"]]) {
          const pattern = "**" + endpoint;
          const failures: string[] = []; const onError = (error: Error) => failures.push(error.message); page.on("pageerror", onError);
          await page.route(pattern, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary admin service interruption." }) }));
          await page.goto(base + path);
          await page.getByRole("heading", { name: "Couldn’t load this admin page", exact: true }).waitFor();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await page.unroute(pattern);
          await page.getByRole("button", { name: "Try again", exact: true }).click();
          await page.getByRole("heading", { name: heading, exact: true }).waitFor();
          assert.deepEqual(failures, [], path); page.off("pageerror", onError);
        }
        await context.close();
      } finally { await browser.close(); }
      console.log("Eight authenticated admin pages and four API failure/retry flows passed");
    }
    await sql.query("insert into rate_limit_buckets(key,window_started_at,count) values($1,now(),240) on conflict(key) do update set window_started_at=now(),count=240", [`api-write:${alice.id}`]);
    const limitedWrite = await api("/api/privacy/settings", aliceCookie, "PUT", { readReceipts: false }, { "x-forwarded-for": "198.51.100.55" });
    assert.equal(limitedWrite.status, 429, "Account limiter cannot be bypassed with a different claimed IP");
    assert(limitedWrite.headers.get("retry-after"));
    assert.equal((await api("/api/auth/logout", aliceCookie, "POST", {})).status, 200, "Logout remains available under mutation throttling");
    await sql.query("insert into rate_limit_buckets(key,window_started_at,count) values($1,now(),25) on conflict(key) do update set window_started_at=now(),count=25", [`login-account:${alice.id}`]);
    assert.equal((await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: alice.username, password }, { "x-forwarded-for": "198.51.100.56" })).status, 429, "Distributed login attempts share an account budget");
    await sql.query("delete from rate_limit_buckets where key = any($1::text[])", [[`login-account:${alice.id}`, `api-write:${alice.id}`]]);
    aliceCookie = await login(alice.username); // The logout assertion revoked the previous session.
    await sql.query("alter table rate_limit_buckets rename to unavailable_rate_limits");
    try { assert.equal((await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: alice.username, password })).status, 429, "Shared rate limit outage fails closed"); }
    finally { await sql.query("alter table unavailable_rate_limits rename to rate_limit_buckets"); }
    await sql.query("insert into rate_limit_buckets(key,window_started_at,count) values('expired-fixture',now()-interval '3 days',1),('active-fixture',now(),1)");
    const expiredEvent = (await sql.query("insert into realtime_events(user_id,payload,created_at) values($1,jsonb_build_object('type','presence:update','expiryFixture',true),now()-interval '15 minutes') returning id", [alice.id])).rows[0];
    assert.equal((await api("/api/cron/process-scheduled")).status, 401);
    const cleanup = await api("/api/cron/process-scheduled", "", "GET", undefined, { authorization: "Bearer remaining-cron" });
    assert.equal(cleanup.status, 200); const pruned = await cleanup.json(); assert(pruned.expiredRateLimits >= 1); assert(pruned.expiredRealtimeEvents >= 1);
    assert.equal((await sql.query("select id from realtime_events where id=$1", [expiredEvent.id])).rows.length, 0);
    assert.equal((await sql.query("select count(*)::int n from realtime_events where payload->>'type'='message:deleted'")).rows[0].n, 2, "Active durable events are preserved");
    assert.equal((await sql.query("select key from rate_limit_buckets where key='expired-fixture'")).rows.length, 0);
    assert.equal((await sql.query("select key from rate_limit_buckets where key='active-fixture'")).rows.length, 1);
    console.log("Admin MFA, stale-auth/replay, moderator boundaries, immutable/transactional audit and fail-closed abuse limits passed");

    type Event = { id?: string; data: Record<string, unknown> };
    const openStream = async (cookie: string, lastId?: string) => {
      const controller = new AbortController(); streams.push(controller);
      const response = await fetch(base + "/api/realtime/stream", { headers: { cookie, ...(lastId ? { "last-event-id": lastId } : {}) }, signal: controller.signal });
      assert.equal(response.status, 200); assert(response.body);
      const events: Event[] = []; let ended = false;
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      void (async () => { try { while (true) {
        const next = await reader.read(); if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true }); let split;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
          const data = frame.split("\n").find((line) => line.startsWith("data: "));
          const id = frame.split("\n").find((line) => line.startsWith("id: "))?.slice(4);
          if (data) events.push({ id, data: JSON.parse(data.slice(6)) });
        }
      } } catch { /* canceled */ } finally { ended = true; } })();
      return { events, controller, ended: () => ended };
    };
    const first = await openStream(aliceCookie), second = await openStream(aliceCookie), outsider = await openStream(bobCookie);
    await sleep(300);
    assert.equal((await sql.query("select count(*)::int n from pg_stat_activity where application_name='ziptalk-realtime-listener' and datname=current_database()")).rows[0].n, 1, "All tabs share a single LISTEN connection");
    const statEnabled = (await sql.query("show shared_preload_libraries")).rows[0].shared_preload_libraries.includes("pg_stat_statements");
    if (statEnabled) await sql.query("create extension if not exists pg_stat_statements");
    const eventReads = async () => Number((await sql.query("select coalesce(sum(calls),0) n from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) and query ilike '%FROM realtime_events%' and query not ilike '%pg_stat_statements%' ")).rows[0].n);
    const beforeIdle = statEnabled ? await eventReads() : null;
    await sleep(1300);
    const afterIdle = statEnabled ? await eventReads() : null;
    if (beforeIdle !== null) assert.equal(afterIdle, beforeIdle, "Idle SSE streams must not query the event queue");
    const start = performance.now();
    await sql.query("insert into realtime_events(user_id,payload) select $1::uuid,jsonb_build_object('type','presence:update','userId',$1::uuid::text,'online',true,'lastSeenAt',now(),'lab',n) from generate_series(1,350)n", [alice.id]);
    const waitFor = async (check: () => boolean, label: string) => { for (let n = 0; n < 200 && !check(); n++) await sleep(25); assert(check(), label); };
    await waitFor(() => first.events.filter((e) => e.data.lab).length >= 350 && second.events.filter((e) => e.data.lab).length >= 350, "Burst exceeds old 200-row ceiling without loss");
    const latency = performance.now() - start;
    assert(latency < 2500, "Notification fan-out promptly delivers a committed burst");
    assert.equal(new Set(first.events.filter((e) => e.data.lab).map((e) => e.id)).size, 350);
    assert.equal(outsider.events.filter((e) => e.data.lab).length, 0, "Stored recipient isolation");
    const forgedId = (await sql.query("insert into realtime_events(user_id,payload) values($1,jsonb_build_object('type','presence:update','lab',999)) returning id", [bob.id])).rows[0].id;
    await sql.query("select pg_notify('ziptalk_realtime',json_build_array($1::text,$2::text)::text)", [alice.id, forgedId]);
    await sleep(200); assert(!first.events.some((e) => e.data.lab === 999), "Forged notification cannot redirect a private event");
    const eventId = first.events.find((e) => e.data.lab === 350)?.id; assert(eventId);
    first.controller.abort();
    await sql.query("insert into realtime_events(user_id,payload,created_at) values($1,jsonb_build_object('type','presence:update','lab',351),now()-interval '10 seconds')", [alice.id]);
    const resumed = await openStream(aliceCookie, eventId);
    await waitFor(() => resumed.events.some((e) => e.data.lab === 351), "Reconnect catches older transaction timestamps");
    await sql.query("select pg_terminate_backend(pid) from pg_stat_activity where application_name='ziptalk-realtime-listener' and datname=current_database()");
    await waitFor(() => second.ended() && resumed.ended(), "Listener loss closes streams for recovery");
    const reconnected = await openStream(aliceCookie, eventId);
    await waitFor(() => reconnected.events.some((e) => e.data.lab === 351), "New listener restores durable catch-up");
    const readsAfterBurst = statEnabled ? await eventReads() : null;
    await mkdir(resolve(".freebuff/performance"), { recursive: true });
    await writeFile(resolve(".freebuff/performance/realtime-lab.json"), JSON.stringify({ generatedAt: new Date().toISOString(), sharedListeners: 1, recipients: 2, burst: 350, latencyMs: latency, idleEventReads: beforeIdle === null ? null : Number(afterIdle) - beforeIdle, totalEventReadCalls: readsAfterBurst, limitation: "Local fixture database; not production load evidence" }, null, 2));
    console.log(`Realtime notification/replay/isolation/recovery checks passed: 350 events to two tabs in ${Math.round(latency)}ms; idle event reads ${beforeIdle === null ? "not instrumented" : 0}`);
  } finally {
    streams.forEach((controller) => controller.abort());
    if (server && server.exitCode === null && server.signalCode === null) { const stopped = once(server, "exit"); server.kill(); await stopped; }
    await sql.end(); await admin.end();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
