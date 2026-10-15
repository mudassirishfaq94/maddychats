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
  const open = async () => {
    const context = await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,serviceWorkers:"block",extraHTTPHeaders:{"X-Forwarded-For":"198.51.100.232"}});
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
    await source.page.getByText("This device: Trusted",{exact:true}).waitFor();
    const target = await open();
    await target.page.getByRole("button",{name:/^Link this device Have/}).waitFor();
    assert(target.page.url().includes("/app/device-access?"));
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
    await target.page.getByLabel("Device linking code",{exact:true}).fill(linkCode);
    await target.page.getByRole("button",{name:"Link this device",exact:true}).click();
    await target.page.waitForURL(base+"/app/chats");
    assert.equal((await source.context.request.get(base+"/api/auth/me")).status(),200,"Linking keeps the old browser signed in");
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
    const after=(await pool.query("select device_id,public_key,trusted_at from e2ee_keys where user_id=$1",[user.id])).rows;
    assert.deepEqual(after.filter(row=>row.trusted_at).map(row=>row.device_id),[pending.device_id]);
    for(const old of before) assert.equal(after.find(row=>row.device_id===old.device_id).public_key,old.public_key,"Old keys are retained without being reconstructed");
    assert.deepEqual(errors,[]);
    console.log("PASS post-auth choices, trusted-device skip, actual code linking, no-trusted recovery, explicit revocation, same account, retained historical keys, mobile bounds (mailbox code fixture; no real email sent)");
  } finally { await browser.close(); await pool.query("delete from users where id=$1 and username=$2",[user.id,name]); }
}
