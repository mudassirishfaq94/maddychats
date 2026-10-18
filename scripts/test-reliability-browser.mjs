import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {Pool} from "pg";
import {openDeviceTools} from "./device-ui-tools.mjs";
import {signSessionToken} from "../src/server/jwt.ts";
import {generateKeyPair,exportPublicKey,exportPrivateKey,encryptPrivateKeyForStorage,generateConversationKey,encryptKeyForUser,conversationFingerprint,encryptMessage} from "../src/lib/crypto.ts";
const url=new URL(process.env.DATABASE_URL??"");
assert(url.hostname==="127.0.0.1"&&url.pathname==="/circlo_audit","Disposable local database required");
const base="http://127.0.0.1:3137",pool=new Pool({connectionString:url.toString(),max:2});
const accounts=[],contexts=[],errors=[];let browser,group;
try {
 // Schema push omits triggers; install the real migration trigger for SSE tests.
 const guards=await readFile("drizzle/0037_realtime_and_admin_guards.sql","utf8");
 await pool.query("DROP TRIGGER IF EXISTS realtime_event_notify ON realtime_events");
 await pool.query(guards.split("CREATE INDEX")[0].replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION"));
 for(let i=0;i<3;i++) {
  const id=randomUUID(),sid=randomUUID(),deviceId=randomUUID(),username=`browser_${randomBytes(5).toString("hex")}`,name=["Audit Owner","Audit Member","Audit Target"][i];
  await pool.query("insert into users(id,username,display_name,email,password_hash,email_verified_at) values($1,$2,$3,$4,'fixture-only',now())",[id,username,name,`${username}@example.invalid`]);
  await pool.query("insert into device_sessions(id,user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) values($1,$2,$3,'browser-fixture',$4,0,now()+interval '1 hour',false)",[sid,id,randomUUID(),Date.now()]);
  const pair=await generateKeyPair(),secret=randomBytes(32).toString("hex"),publicKey=await exportPublicKey(pair.publicKey),encryptedPrivateKey=`v2:${await encryptPrivateKeyForStorage(await exportPrivateKey(pair.privateKey),secret)}`;
  await pool.query("insert into e2ee_keys(user_id,device_id,session_id,public_key,encrypted_private_key,trusted_at) values($1,$2,$3,$4,$5,now())",[id,deviceId,sid,publicKey,encryptedPrivateKey]);
  const token=await signSessionToken(id,username,Date.now(),0,sid);
  accounts.push({id,sid,deviceId,username,name,pair,secret,publicKey,encryptedPrivateKey,token});
 }
 const owner=accounts[0],member=accounts[1],target=accounts[2];group=randomUUID();
 await pool.query("insert into conversations(id,type,name,created_by_id) values($1,'group','Browser audit group',$2)",[group,owner.id]);
 for(const [i,account] of accounts.slice(0,2).entries())await pool.query("insert into conversation_members(conversation_id,user_id,role,accepted_at) values($1,$2,$3,now())",[group,account.id,i===0?"owner":"member"]);
 const key=await generateConversationKey(),fingerprint=await conversationFingerprint(key);
 for(const account of accounts)await pool.query("insert into e2ee_conversation_keys(conversation_id,user_id,device_id,recipient_device_id,encrypted_key,key_fingerprint) values($1,$2,$3,$3,$4,$5)",[group,account.id,account.deviceId,await encryptKeyForUser(key,account.pair.publicKey),fingerprint]);
 browser=await chromium.launch({headless:true,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
 for(const account of accounts.slice(0,2)) {
  const context=await browser.newContext({viewport:{width:430,height:900},timezoneId:"Asia/Dubai",permissions:["microphone"],serviceWorkers:"block"});contexts.push(context);
  await context.addCookies([{name:"maddy_session",value:account.token,url:base,httpOnly:true,sameSite:"Lax"}]);
  // Initialize once; reloads and storage-loss tests must exercise actual application recovery.
  await context.addInitScript(account=>{
   if(sessionStorage.getItem("audit-fixture-initialized"))return;
   sessionStorage.setItem("audit-fixture-initialized","1");
   localStorage.setItem("e2ee_device_id",account.deviceId);
   localStorage.setItem(`e2ee_recovery_${account.id}_${account.deviceId}`,account.secret);
   localStorage.setItem(`e2ee_keypair_${account.id}`,JSON.stringify({publicKey:account.publicKey,encryptedPrivateKey:account.encryptedPrivateKey}));
  },{id:account.id,deviceId:account.deviceId,secret:account.secret,publicKey:account.publicKey,encryptedPrivateKey:account.encryptedPrivateKey});
  const page=await context.newPage();page.setDefaultTimeout(30000);page.setDefaultNavigationTimeout(120000);page.on("pageerror",error=>{errors.push(error.message);console.error("Browser runtime error:",error.message);});account.page=page;
  await page.goto(`${base}/app/chats/${group}`);await page.getByRole("textbox",{name:"Message text"}).waitFor();
 }
 const api=async(account,path,body,method="POST")=>account.page.request.fetch(base+path,{method,headers:{Origin:base,"Content-Type":"application/json"},...(body?{data:body}:{})});
 // Warm mutation routes before measuring five-second foreground countdowns.
 for(const path of ["/api/messages/11111111-1111-4111-8111-111111111111/reveal","/api/conversations/11111111-1111-4111-8111-111111111111/messages"])await api(member,path,{});
 console.log("START: member group controls");await member.page.getByRole("button",{name:"Open group settings",exact:true}).click();console.log("Opened group details");
 await member.page.getByRole("button",{name:"Group settings",exact:true}).click();
 const nameInput=member.page.getByLabel("Group name",{exact:true});await nameInput.waitFor();assert.equal(await nameInput.isDisabled(),true);
 const add=member.page.getByPlaceholder("Add members…");await add.fill(target.username);
 await member.page.getByRole("button").filter({hasText:target.name}).click();
 await member.page.getByText("3 members · 1 admins").waitFor();
 const allowed=await api(owner,`/api/groups/${group}/settings`,{adminOnlyEditingInfo:false},"PATCH");assert.equal(allowed.status(),200);
 await nameInput.waitFor();await member.page.waitForFunction(id=>!document.querySelector(`#group-${id}-name`)?.disabled,group);
 const denied=await api(member,`/api/groups/${group}/settings`,{adminOnlyAddingMembers:true},"PATCH");assert.equal(denied.status(),403);
 assert.equal((await api(owner,`/api/groups/${group}/settings`,{adminOnlyAddingMembers:true},"PATCH")).status(),200);
 await add.waitFor({state:"hidden"});
 assert.equal((await api(member,`/api/groups/${group}/members`,{userId:randomUUID()})).status(),403);
 await member.page.getByRole("button",{name:"Close details",exact:true}).click();
 console.log("PASS: member group info/addition; live policy update; backend policy denial");
 // Adding a participant preserves existing device-verification requirements.
 // Compare against the independently generated fixture identities before approval.
 for(const account of [owner,member]) {
  await account.page.reload();
  await account.page.getByRole("button").filter({hasText:"Encryption device keys changed."}).click();
  const fingerprints=await account.page.getByLabel("Participant device fingerprint").allTextContents();
  assert.deepEqual(fingerprints.sort(),accounts.filter(peer=>peer!==account).map(peer=>createHash("sha256").update(peer.publicKey).digest("hex")).sort());
  await account.page.getByLabel("I verified these participant device identities or confirmed the intended removal.",{exact:true}).check();
  await account.page.getByRole("button",{name:"Approve verified changes",exact:true}).click();
 }
 console.log("PASS: added participant identities verified without bypassing E2EE trust");
 const normal=`Normal encrypted regression ${randomUUID()}`;
 await owner.page.getByRole("textbox",{name:"Message text"}).fill(normal);await owner.page.getByRole("button",{name:"Send message",exact:true}).click();
 await member.page.getByRole("region",{name:"Messages",exact:true}).getByText(normal,{exact:true}).waitFor();console.log("PASS: normal E2EE message decrypted across browser sessions");
 const note=`Ephemeral private note ${randomUUID()}`;
 await owner.page.getByLabel("Self-destruct message · 5 seconds after first reveal",{exact:true}).check();
 await owner.page.getByRole("textbox",{name:"Message text"}).fill(note);await owner.page.getByRole("button",{name:"Send message",exact:true}).click();
 const reveal=member.page.getByRole("button",{name:"Reveal · disappears in 5 seconds",exact:true});await reveal.waitFor();assert.equal(await member.page.getByRole("region",{name:"Messages",exact:true}).getByText(note,{exact:true}).count(),0);
 await reveal.click();await member.page.getByRole("region",{name:"Messages",exact:true}).getByText(note,{exact:true}).waitFor();
 const lifetime=(await pool.query("select id,revealed_at,expires_at from messages where conversation_id=$1 and self_destruct order by created_at desc limit 1",[group])).rows[0];
 assert.equal(lifetime.expires_at.getTime()-lifetime.revealed_at.getTime(),5000);
 await member.page.waitForTimeout(1800);await member.page.reload();
 await member.page.getByRole("region",{name:"Messages",exact:true}).getByText("Message expired",{exact:true}).waitFor({timeout:20000});
 assert.equal(await member.page.getByRole("region",{name:"Messages",exact:true}).getByText(note,{exact:true}).count(),0);
 assert.equal((await pool.query("select expires_at from messages where id=$1",[lifetime.id])).rows[0].expires_at.getTime(),lifetime.expires_at.getTime());
 await member.page.reload();await member.page.getByRole("region",{name:"Messages",exact:true}).getByText("Message expired",{exact:true}).waitFor();
 const exported=await api(member,`/api/conversations/${group}/export`,null,"GET");assert.equal(exported.status(),200);assert.equal((await exported.text()).includes(lifetime.id),false);
 console.log("PASS: explicit reveal, fixed countdown, reload persistence and export exclusion");
 const scheduled=await api(owner,`/api/conversations/${group}/scheduled`,{text:await encryptMessage("Scheduled editable note",key),encrypted:true,scheduledFor:new Date(Date.now()+120000).toISOString()});assert.equal(scheduled.status(),201);
 await owner.page.getByRole("button",{name:"Scheduled messages",exact:true}).click();await owner.page.getByRole("button",{name:"Edit message and time",exact:true}).click();
 const messageField=owner.page.getByRole("dialog",{name:"Manage scheduled messages"}).getByRole("textbox",{name:"Message",exact:true});await messageField.waitFor({timeout:90000});assert.equal(await messageField.inputValue(),"Scheduled editable note");
 await messageField.fill("Updated encrypted schedule");await owner.page.getByRole("button",{name:"Save scheduled message",exact:true}).click();
 await owner.page.getByRole("button",{name:"Cancel sending",exact:true}).click();await owner.page.getByText("No messages waiting to send.",{exact:true}).waitFor();await owner.page.getByRole("button",{name:"Close",exact:true}).click();
 console.log("PASS: scheduled-message decrypt/edit/cancel UI");
 await owner.page.goto(base+"/app/profile#encryption-devices");await openDeviceTools(owner.page);
 await owner.page.getByRole("button",{name:"Set up recovery code",exact:true}).click();const code=await owner.page.locator('[aria-label="New recovery code"]').textContent();assert(code);
 await owner.page.getByLabel("Re-enter the saved code",{exact:true}).fill(code);await owner.page.getByRole("button",{name:"Confirm code and save encrypted backup",exact:true}).click();await owner.page.getByText(/Encrypted recovery is configured/).waitFor();
 const backup=(await pool.query("select id,envelope from recovery_backups where user_id=$1",[owner.id])).rows[0];assert(backup);assert.equal(JSON.stringify(backup.envelope).includes(code),false);
 await owner.page.evaluate(()=>localStorage.clear());await owner.page.reload();await openDeviceTools(owner.page);
 await owner.page.getByText("Restore using a saved recovery code",{exact:true}).click();await owner.page.getByLabel("Backup",{exact:true}).selectOption(backup.id);await owner.page.getByLabel("Saved recovery code",{exact:true}).fill(code);
 await owner.page.getByLabel(/I have preserved any keys needed from this browser/).check();await owner.page.getByRole("button",{name:"Restore encrypted keys",exact:true}).click();
 await owner.page.waitForTimeout(1000);await owner.page.goto(`${base}/app/chats/${group}`);await owner.page.getByRole("region",{name:"Messages",exact:true}).getByText(normal,{exact:true}).waitFor();
 console.log("PASS: cloud recovery setup; browser storage loss; original encrypted history restored");
 assert.deepEqual(errors,[]);console.log("Browser reliability suite passed.");
} catch(error) { console.error("Workflow failed:",error);for(const [i,account] of accounts.entries()){if(account.page)await account.page.screenshot({path:`${process.env.TEMP??"."}/circlo-audit-failure-${i}.png`}).catch(()=>{});} throw error; } finally {
 if(browser)await browser.close();
 if(group)await pool.query("delete from conversations where id=$1",[group]);
 if(accounts.length)await pool.query("delete from users where id=any($1::uuid[])",[accounts.map(account=>account.id)]);
 await pool.end();
}
