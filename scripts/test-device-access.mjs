import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createHash, createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { inspectMobileLayout } from "./test-mobile-layout.mjs";

export async function testDeviceAccess(base, pool, secret) {
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  const name = "accessqa_" + randomBytes(6).toString("hex"), password = "Aa9" + randomBytes(20).toString("hex");
  const user = (await pool.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id", [name,name+"@example.invalid",await bcrypt.hash(password,12)])).rows[0];
  const browser = await chromium.launch(), errors = [];
  const open = async existingContext => {
    const context = existingContext ?? await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,serviceWorkers:"block",extraHTTPHeaders:{"X-Forwarded-For":"198.51.100.232"}});
    const page = await context.newPage(); page.on("pageerror",e=>errors.push(e.message));
    await page.goto(base+"/login?next=%2Fapp%2Fchats");
    await page.getByLabel("Email or username",{exact:true}).fill(name);
    await page.getByLabel("Password",{exact:true}).fill(password);
    for (const box of await page.getByRole("checkbox").all()) await box.check();
    await page.getByRole("button",{name:"Sign in",exact:true}).click();
    return {context,page};
  };
  try {
    const anonymous = await browser.newContext();
    const redirect = await anonymous.request.get(base+"/app/device-access",{maxRedirects:0});
    assert([303,307].includes(redirect.status()));
    assert(new URL(redirect.headers().location,base).pathname === "/login"); await anonymous.close();
    const source = await open(); await source.page.waitForURL(base+"/app/chats");
    await source.page.goto(base+"/app/profile#encryption-devices");
    await source.page.getByText("This device: Linked",{exact:true}).waitFor();
    const target = await open();
    await target.page.getByRole("button",{name:/^Link this device Have/}).waitFor();
    assert(target.page.url().includes("/app/device-access?"));
    assert.equal((await target.context.request.get(base+"/api/auth/me")).status(),202,"Credentials create only a restricted verification session");
    for (const route of ["/api/users/me","/api/conversations","/api/contacts","/api/status","/api/communities","/api/notifications","/api/privacy/settings","/api/admin/stats","/api/calls"]) {
      assert.equal((await target.context.request.get(base+route)).status(),401,route+" cannot be read before device approval");
    }
    for (const route of ["/api/conversations","/api/calls","/api/status"]) assert.equal((await target.context.request.post(base+route,{headers:{Origin:base},data:{}})).status(),401,route+" cannot be mutated before device approval");
    const profile = await target.context.request.get(base+"/app/profile",{maxRedirects:0});
    assert.equal(profile.status(),307); assert(new URL(profile.headers().location,base).pathname === "/app/device-access");
    const backup = (await pool.query("select device_id,public_key,encrypted_private_key,device_name from e2ee_keys where user_id=$1 and trusted_at is not null",[user.id])).rows[0];
    await pool.query("update e2ee_keys set encrypted_private_key='legacy-device-id-only-backup' where user_id=$1 and device_id=$2",[user.id,backup.device_id]);
    const restrictedKeys = await (await target.context.request.get(base+"/api/e2ee/keys")).json();
    assert.equal(restrictedKeys.keys.find(k=>k.deviceId===backup.device_id).encryptedPrivateKey,undefined,"Restricted sign-ins cannot download legacy weakly wrapped private keys");
    const overwrite = await target.context.request.post(base+"/api/e2ee/keys",{headers:{Origin:base},data:{deviceId:backup.device_id,publicKey:backup.public_key,encryptedPrivateKey:"attacker-replacement",deviceName:"Spoofed trusted browser"}});
    assert.equal(overwrite.status(),200);
    assert.equal((await pool.query("select encrypted_private_key from e2ee_keys where user_id=$1 and device_id=$2",[user.id,backup.device_id])).rows[0].encrypted_private_key,"legacy-device-id-only-backup","A primary credential cannot overwrite an existing key backup without private-key proof");
    assert.equal((await pool.query("select device_name from e2ee_keys where user_id=$1 and device_id=$2",[user.id,backup.device_id])).rows[0].device_name,backup.device_name,"Restricted sign-ins cannot spoof another browser's label");
    await pool.query("update e2ee_keys set encrypted_private_key=$3 where user_id=$1 and device_id=$2",[user.id,backup.device_id,backup.encrypted_private_key]);
    const oldCookies = await target.context.cookies();
    await target.context.addCookies(oldCookies.filter(c=>c.name==="maddy_session").map(c=>({...c,value:"invalid-access-force-refresh"})));
    assert.equal((await target.context.request.get(base+"/api/auth/me",{headers:{Origin:base}})).status(),202,"Refresh rotation cannot upgrade a restricted session");
    assert.equal(await target.page.getByLabel("Device linking code",{exact:true}).count(),0);
    assert.equal(await target.page.getByRole("button",{name:/Delete|Approve encryption|Emergency recovery/}).count(),0);
    for(const [width,height] of [[320,740],[390,844],[844,390],[390,360]]) {
      await target.page.setViewportSize({width,height});
      assert.deepEqual(await inspectMobileLayout(target.page,"access-choice"),[]);
    }
    await target.page.getByRole("button",{name:/^Link this device Have/}).click();
    await source.page.getByText("Troubleshooting",{exact:true}).click();
    await source.page.getByRole("button",{name:"Refresh encryption devices",exact:true}).click();
    await source.page.getByRole("button",{name:"Generate linking code",exact:true}).click();
    const linkCode = await source.page.getByLabel("Device linking code",{exact:true}).innerText();
    assert(/^\d{6}$/.test(linkCode),"Trusted devices issue six digits");
    await target.page.getByLabel("Device linking code",{exact:true}).fill(linkCode);
    await target.page.getByRole("button",{name:"Link this device",exact:true}).click();
    await target.page.waitForURL(base+"/app/chats");
    assert.equal((await source.context.request.get(base+"/api/auth/me")).status(),200,"Linking keeps the old browser signed in");
    assert.equal((await source.context.request.post(base+"/api/auth/logout",{headers:{Origin:base}})).status(),200);
    await source.page.close();
    source.page = (await open(source.context)).page;
    await source.page.waitForURL(base+"/app/chats");
    assert.equal((await source.context.request.get(base+"/api/auth/me")).status(),200,"Returning trusted browsers prove their saved key without another linking code");
    const before = (await pool.query("select device_id,public_key from e2ee_keys where user_id=$1",[user.id])).rows;
    assert.equal(before.length,2);
    // Only this owned fake account loses trust, reproducing the no-trusted-device case.
    await pool.query("update e2ee_keys set trusted_at=null where user_id=$1",[user.id]);
    const recovery = await open();
    await recovery.page.getByRole("button",{name:/^Recover access Lost/}).click();
    assert.equal(await recovery.page.getByLabel("Device linking code",{exact:true}).count(),0,"Only the selected form is shown");
    const confirm = recovery.page.getByRole("button",{name:"Confirm email and recover this browser",exact:true});
    assert(await confirm.isDisabled());
    assert(await recovery.page.getByText("Your email code cannot bring back lost encryption keys.",{exact:false}).isVisible());
    // A mailbox-code fixture avoids calling a paid or third-party email service.
    const pending = (await pool.query("select device_id,session_id,public_key from e2ee_keys where user_id=$1 order by created_at desc limit 1",[user.id])).rows[0];
    const fingerprint=createHash("sha256").update(pending.public_key).digest("hex"), code="483162";
    await pool.query("update users set email_verified_at=null where id=$1",[user.id]);
    const missingEmail = await recovery.context.request.post(base+"/api/e2ee/devices/approve",{headers:{Origin:base},data:{action:"challenge",decision:"recover",sourceDeviceId:pending.device_id,targetDeviceId:pending.device_id,targetFingerprint:fingerprint,confirmation:"RESET ENCRYPTION TRUST"}});
    assert.equal(missingEmail.status(),409,"A primary credential and pending key cannot replace verified-email recovery");
    await pool.query("update users set email_verified_at=now() where id=$1",[user.id]);
    const hash=createHmac("sha256",secret).update(`device-recovery-email:v1:${user.id}:${pending.device_id}:${pending.session_id}:${fingerprint}:${code}`).digest("hex");
    await pool.query("insert into device_recovery_email_codes(user_id,device_id,session_id,fingerprint,code_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '10 minutes')",[user.id,pending.device_id,pending.session_id,fingerprint,hash]);
    await recovery.page.getByLabel("Email recovery code",{exact:true}).fill(code);
    assert(await confirm.isDisabled(),"A code alone cannot sign out old devices without consent");
    assert.equal((await source.context.request.get(base+"/api/auth/me")).status(),200);
    await recovery.page.getByRole("checkbox",{name:/I want to sign out my other devices/}).check();
    for(const [width,height] of [[320,740],[844,390],[390,360]]) {
      await recovery.page.setViewportSize({width,height}); await confirm.scrollIntoViewIfNeeded();
      assert.deepEqual(await inspectMobileLayout(recovery.page,"access-recovery"),[]);
    }
    await confirm.click(); await recovery.page.waitForURL(base+"/app/chats");
    assert.equal((await source.context.request.get(base+"/api/auth/me")).status(),401);
    assert.equal((await target.context.request.get(base+"/api/auth/me")).status(),401);
    const me=await recovery.context.request.get(base+"/api/auth/me"); assert.equal(me.status(),200);
    assert.equal((await me.json()).user.id,user.id,"Recovery retains the same account");
    const recoveredCookies = await recovery.context.cookies();
    await recovery.context.addCookies(recoveredCookies.filter(c=>c.name==="maddy_session").map(c=>({...c,value:"invalid-access-force-refresh"})));
    assert.equal((await recovery.context.request.get(base+"/api/auth/me",{headers:{Origin:base}})).status(),200,"The recovered browser can refresh without being revoked or restricted again");
    const after=(await pool.query("select device_id,public_key,trusted_at from e2ee_keys where user_id=$1",[user.id])).rows;
    assert.deepEqual(after.filter(row=>row.trusted_at).map(row=>row.device_id),[pending.device_id]);
    for(const old of before) assert.equal(after.find(row=>row.device_id===old.device_id).public_key,old.public_key,"Old keys are retained without being reconstructed");
    const guessing = await open();
    await guessing.page.getByRole("button",{name:/^Link this device Have/}).waitFor();
    const guessDevice = (await pool.query("select device_id from e2ee_keys where user_id=$1 order by created_at desc limit 1",[user.id])).rows[0];
    for (let attempt=0;attempt<4;attempt++) assert.equal((await guessing.context.request.post(base+"/api/e2ee/devices/link/verify",{headers:{Origin:base},data:{deviceId:guessDevice.device_id,code:"000000"}})).status(),403);
    assert.equal((await guessing.context.request.post(base+"/api/e2ee/devices/link/verify",{headers:{Origin:base},data:{deviceId:guessDevice.device_id,code:"000000"}})).status(),429,"Six-digit guessing is blocked after the per-account budget");
    assert.deepEqual(errors,[]);
    console.log("PASS post-auth choices, trusted-device skip, actual code linking, no-trusted recovery, explicit revocation, same account, retained historical keys, mobile bounds (mailbox code fixture; no real email sent)");
  } finally { await browser.close(); await pool.query("delete from users where id=$1 and username=$2",[user.id,name]); }
}
