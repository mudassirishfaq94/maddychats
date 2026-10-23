import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright";
import sharp from "sharp";
import {Pool} from "pg";
import {openDeviceTools} from "./device-ui-tools.mjs";
import {testCommunityUx} from "./test-community-ux.mjs";
import {testUxFeatures,testDeliveryApi} from "./test-ux-features.mjs";
import {testNativeNotificationState} from "./test-native-notification-state.mjs";
import {testTemporaryRooms} from "./test-temporary-rooms.mjs";
import {testOfflineCompose} from "./test-offline-compose.mjs";
import {testNavigationLatency} from "./test-navigation-latency.mjs";
import {testCachedChatHistory} from "./test-cached-chat-history.mjs";
import {signSessionToken} from "../src/server/jwt.ts";
import {generateKeyPair,exportPublicKey,exportPrivateKey,encryptPrivateKeyForStorage,generateConversationKey,encryptKeyForUser,conversationFingerprint,encryptMessage} from "../src/lib/crypto.ts";
const url=new URL(process.env.DATABASE_URL??"");
assert(url.hostname==="127.0.0.1"&&url.pathname==="/circlo_audit","Disposable local database required");
const base="http://127.0.0.1:3137",pool=new Pool({connectionString:url.toString(),max:2});
const accounts=[],contexts=[],errors=[];let browser,group,callChat;
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
  const context=await browser.newContext({viewport:{width:430,height:900},timezoneId:"Asia/Dubai",permissions:["microphone"],serviceWorkers:process.env.OFFLINE_ONLY==="1"?"allow":"block"});contexts.push(context);
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
  await page.waitForFunction(id=>Boolean(localStorage.getItem(`e2ee_keypair_${id}`)),account.id);
  assert.equal(await page.evaluate(({id,envelope})=>JSON.parse(localStorage.getItem(`e2ee_keypair_${id}`)).encryptedPrivateKey===envelope,{id:account.id,envelope:account.encryptedPrivateKey}),true,"An unchanged protected key envelope is reused during startup");
 }
 if(process.env.OFFLINE_ONLY==="1"){
  await testOfflineCompose(contexts[0],base,owner,group,pool,member);
 }else if(process.env.NAVIGATION_ONLY==="1"){
  await testNavigationLatency(contexts[0],base,group);
 }else{
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
  await account.page.getByRole("button").filter({hasText:"A device changed in this chat."}).click();
  await account.page.getByLabel("Participant safety number").nth(accounts.length-2).waitFor();
  const fingerprints=await account.page.getByLabel("Participant safety number").allTextContents();
  assert.deepEqual(fingerprints.sort(),accounts.filter(peer=>peer!==account).map(peer=>createHash("sha256").update(peer.publicKey).digest("hex")).sort());
  await account.page.getByLabel("I compared the safety numbers and they match.",{exact:true}).check();
  await account.page.getByRole("button",{name:"Approve",exact:true}).click();
 }
 console.log("PASS: added participant identities verified without bypassing E2EE trust");
 const normal=`Normal encrypted regression ${randomUUID()}`;
 await owner.page.getByRole("textbox",{name:"Message text"}).fill(normal);await owner.page.getByRole("button",{name:"Send message",exact:true}).click();
 await member.page.getByRole("region",{name:"Messages",exact:true}).getByText(normal,{exact:true}).waitFor();console.log("PASS: normal E2EE message decrypted across browser sessions");
 const cachedMessage=(await pool.query("select id,text from messages where conversation_id=$1 and not self_destruct order by created_at desc limit 1",[group])).rows[0];
 await testCachedChatHistory(member.page,member.id,group,cachedMessage,normal);
 const note=`Ephemeral private note ${randomUUID()}`;
 await owner.page.getByRole("textbox",{name:"Message text"}).fill(note);
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
 await owner.page.getByRole("button",{name:"Open group settings",exact:true}).click();
 await owner.page.getByRole("button",{name:"Group settings",exact:true}).click();
 await owner.page.getByRole("button",{name:"More Scheduled messages",exact:true}).click();
 await owner.page.getByRole("button",{name:"Scheduled messages",exact:true}).click();await owner.page.getByRole("button",{name:"Edit message and time",exact:true}).click();
 const messageField=owner.page.getByRole("dialog",{name:"Manage scheduled messages"}).getByRole("textbox",{name:"Message",exact:true});await messageField.waitFor({timeout:90000});assert.equal(await messageField.inputValue(),"Scheduled editable note");
 await messageField.fill("Updated encrypted schedule");await owner.page.getByRole("button",{name:"Save scheduled message",exact:true}).click();
 await owner.page.getByRole("button",{name:"Cancel sending",exact:true}).click();await owner.page.getByText("No messages waiting to send.",{exact:true}).waitFor();await owner.page.getByRole("button",{name:"Close",exact:true}).click();
 console.log("PASS: scheduled-message decrypt/edit/cancel UI");
 await owner.page.getByRole("button",{name:"Close details",exact:true}).click();
 // Exercise actual browser encryption, four bounded transfers and recipient decryption.
 const png=await readFile(new URL("../public/icons/circlo-192.png",import.meta.url));
 const largeImage=Buffer.alloc(12*1024*1024);png.copy(largeImage);
 const jpeg=await sharp(png).jpeg().toBuffer();const smallJpeg=Buffer.alloc(128*1024);jpeg.copy(smallJpeg);
 await owner.page.locator('input[type="file"]').first().setInputFiles({name:"Screenshot2_123.circlo.app.jpg",mimeType:"image/jpg",buffer:smallJpeg});
 const jpegResponse=owner.page.waitForResponse(response=>new URL(response.url()).pathname==="/api/upload/message"&&response.request().method()==="POST");
 await owner.page.getByRole("button",{name:"Send attachments",exact:true}).click();const sentJpeg=await jpegResponse;assert.equal(sentJpeg.status(),201,await sentJpeg.text());assert.equal((await sentJpeg.json()).message.attachments[0].mimeType,"image/jpeg");
 console.log("PASS: actual 128 KB JPEG with Android MIME alias uploads encrypted");
 await owner.page.locator('input[type="file"]').first().setInputFiles({name:"large-encrypted-preview.png",mimeType:"image/png",buffer:largeImage});
 const uploadResponse=owner.page.waitForResponse(response=>new URL(response.url()).pathname==="/api/upload/message"&&response.request().method()==="POST");
 await owner.page.getByRole("button",{name:"Send attachments",exact:true}).click();const uploaded=await uploadResponse;assert.equal(uploaded.status(),201,await uploaded.text());
 const media=(await uploaded.json()).message.attachments[0];assert.equal(media.encrypted,true);assert.equal(media.size,largeImage.length+28);
 await member.page.getByRole("region",{name:"Messages",exact:true}).getByAltText("large-encrypted-preview.png",{exact:true}).waitFor({timeout:60000});
 const image=member.page.getByRole("region",{name:"Messages",exact:true}).getByAltText("large-encrypted-preview.png",{exact:true});
 await image.evaluate(element=>new Promise((resolve,reject)=>{if(element.complete&&element.naturalWidth>0)return resolve();element.addEventListener('load',()=>resolve(),{once:true});element.addEventListener('error',()=>reject(new Error('Recipient could not decode encrypted image')),{once:true});}));
 console.log("PASS: large encrypted chunk upload and real recipient image decryption");
 // File chips must not download ciphertext until the recipient requests it.
 const downloads = [];
 const observeMedia = request => { if (new URL(request.url()).pathname.startsWith("/api/media/")) downloads.push(request.url()); };
 member.page.on("request", observeMedia);
 await owner.page.locator('input[type="file"]').first().setInputFiles({name:"on-demand-performance.txt",mimeType:"text/plain",buffer:Buffer.from("disposable performance file")});
 const fileResponse = owner.page.waitForResponse(response=>new URL(response.url()).pathname==="/api/upload/message"&&response.request().method()==="POST");
 await owner.page.getByRole("button",{name:"Send attachments",exact:true}).click();
 const fileResult = await fileResponse; assert.equal(fileResult.status(),201,await fileResult.text());
 const fileAttachment = (await fileResult.json()).message.attachments[0];
 await member.page.getByRole("button",{name:"Download on-demand-performance.txt",exact:true}).waitFor();
 await member.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(downloads.filter(url=>new URL(url).pathname===`/api/media/${fileAttachment.id}`).length,0,"File chips must not eagerly download encrypted bytes");
 const download = member.page.waitForEvent("download");
 await member.page.getByRole("button",{name:"Download on-demand-performance.txt",exact:true}).click();
 assert.equal((await download).suggestedFilename(),"on-demand-performance.txt");
 assert.equal(downloads.filter(url=>new URL(url).pathname===`/api/media/${fileAttachment.id}`).length,1,"Requested file downloads once");
 member.page.off("request",observeMedia);
 console.log("PASS: encrypted file is fetched once on recipient intent");


 await owner.page.goto(base+"/app/profile#encryption-devices");await openDeviceTools(owner.page);
 await owner.page.getByRole("button",{name:"Set up recovery code",exact:true}).click();const code=await owner.page.locator('[aria-label="New recovery code"]').textContent();assert(code);
 await owner.page.getByLabel("Re-enter the saved code",{exact:true}).fill(code);await owner.page.getByRole("button",{name:"Confirm code and save encrypted backup",exact:true}).click();await owner.page.getByText(/Encrypted recovery is configured/).waitFor();
 const backup=(await pool.query("select id,envelope from recovery_backups where user_id=$1",[owner.id])).rows[0];assert(backup);assert.equal(JSON.stringify(backup.envelope).includes(code),false);
 await owner.page.evaluate(()=>localStorage.clear());await owner.page.reload();await openDeviceTools(owner.page);
 await owner.page.getByText("Restore using a saved recovery code",{exact:true}).click();await owner.page.getByLabel("Backup",{exact:true}).selectOption(backup.id);await owner.page.getByLabel("Saved recovery code",{exact:true}).fill(code);
 await owner.page.getByLabel(/I have preserved any keys needed from this browser/).check();await owner.page.getByRole("button",{name:"Restore encrypted keys",exact:true}).click();
 await owner.page.waitForTimeout(1000);await owner.page.goto(`${base}/app/chats/${group}`);await owner.page.getByRole("region",{name:"Messages",exact:true}).getByText(normal,{exact:true}).waitFor();
 console.log("PASS: cloud recovery setup; browser storage loss; original encrypted history restored");
 // Real WebRTC, cold recipient launch through Answer, then SSE-offline decline.
 callChat=randomUUID();
 await pool.query("insert into conversations(id,type,created_by_id) values($1,'dm',$2)",[callChat,owner.id]);
 for(const account of [owner,member]) {
  await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())",[callChat,account.id]);
  await pool.query("insert into e2ee_conversation_keys(conversation_id,user_id,device_id,recipient_device_id,encrypted_key,key_fingerprint) values($1,$2,$3,$3,$4,$5)",[callChat,account.id,account.deviceId,await encryptKeyForUser(key,account.pair.publicKey),fingerprint]);
 }
 await member.page.close();
 await owner.page.goto(`${base}/app/chats/${callChat}`);
 const ice=await owner.page.request.get(base+"/api/calls/ice");assert.equal(ice.status(),200);assert(Array.isArray((await ice.json()).iceServers));
 await owner.page.getByRole("button",{name:"Start audio call",exact:true}).click();
 await owner.page.getByText("Calling…",{exact:true}).waitFor();
 const ringing=(await pool.query("select id from audio_calls where conversation_id=$1 and state='ringing'",[callChat])).rows[0];assert(ringing,"Offline recipient must still receive persisted signaling");
 member.page=await contexts[1].newPage();member.page.setDefaultTimeout(30000);member.page.on("pageerror",error=>errors.push(error.message));
 await member.page.addInitScript(()=>{window.callTestMicrophones=[];const add=RTCPeerConnection.prototype.addTrack;RTCPeerConnection.prototype.addTrack=function(track,...streams){if(track.kind==="audio")window.callTestMicrophones.push(track);return add.call(this,track,...streams);};});
 await contexts[1].route("**/api/realtime/stream",route=>route.abort());
 await member.page.goto(`${base}/app/call?call=${ringing.id}&callAction=answer&callActionToken=${randomUUID()}`);
 await member.page.getByRole("button",{name:"Answer",exact:true}).waitFor();
 assert.equal((await pool.query("select state from audio_calls where id=$1",[ringing.id])).rows[0].state,"ringing","An arbitrary URL must never auto-answer");
 await member.page.evaluate(chat=>{localStorage.setItem("maddy:locked-chats",JSON.stringify([chat]));window.dispatchEvent(new Event("maddy:locked-chats"));},callChat);
 await member.page.getByRole("region",{name:"Audio call",exact:true}).getByText("Circlo",{exact:true}).waitFor();
 assert.equal(await member.page.getByRole("region",{name:"Audio call",exact:true}).getByText(owner.name,{exact:true}).count(),0);
 await member.page.evaluate(()=>{localStorage.setItem("maddy:locked-chats","[]");window.dispatchEvent(new Event("maddy:locked-chats"));});
 await member.page.getByRole("region",{name:"Audio call",exact:true}).getByText(owner.name,{exact:true}).waitFor();
 const actionToken=randomUUID();
 await member.page.evaluate(async({user,call,token})=>{
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open("circlo-notification-privacy",1);request.onupgradeneeded=()=>request.result.createObjectStore("locks");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const tx=database.transaction("locks","readwrite");tx.objectStore("locks").put({recipientId:user,token,expiresAt:Date.now()+15000},`call-action:${call}`);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject;});database.close();
 },{user:member.id,call:ringing.id,token:actionToken});
 await member.page.goto(`${base}/app/call?call=${ringing.id}&callAction=answer&callActionToken=${actionToken}`);
 assert.equal(await member.page.getByRole("region",{name:"Conversation",exact:true}).count(),0,"Notification Answer must not mount chat history");
 for(const account of [owner,member])await account.page.getByText("Audio connected",{exact:true}).waitFor({timeout:45000});
 const duration=member.page.getByLabel("Call duration",{exact:true});
 await duration.waitFor();
 const initialDuration=await duration.innerText();
 await mkdir("test-artifacts",{recursive:true});
 await member.page.setViewportSize({width:360,height:740});
 await member.page.screenshot({path:"test-artifacts/call-controls-mobile.png"});
 assert(await member.page.getByRole("button",{name:"End call",exact:true}).evaluate(button=>{const rect=button.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;}),"Hang up must remain reachable on a small phone");
 await member.page.setViewportSize({width:1280,height:800});
 await member.page.screenshot({path:"test-artifacts/call-controls-desktop.png"});
 await member.page.setViewportSize({width:430,height:900});
 await member.page.waitForFunction(initial=>document.querySelector('[aria-label="Call duration"]')?.textContent!==initial,initialDuration);
 await member.page.getByRole("button",{name:"Mute",exact:true}).click();
 assert.equal(await member.page.getByRole("button",{name:"Unmute",exact:true}).getAttribute("aria-pressed"),"true");
 assert(await member.page.evaluate(()=>window.callTestMicrophones.length>0&&window.callTestMicrophones.every(track=>!track.enabled)),"Mute must disable the real outgoing microphone track");
 await member.page.getByRole("button",{name:"Unmute",exact:true}).click();
 assert.equal(await member.page.getByRole("button",{name:"Mute",exact:true}).getAttribute("aria-pressed"),"false");
 assert(await member.page.evaluate(()=>window.callTestMicrophones.every(track=>track.enabled)),"Unmute must restore the outgoing microphone track");
 await member.page.getByRole("button",{name:"Minimize call controls",exact:true}).click();
 await member.page.getByRole("button",{name:"Open call controls",exact:true}).click();
 await member.page.getByLabel("Call duration",{exact:true}).waitFor();
 assert.notEqual(await member.page.getByLabel("Call duration",{exact:true}).innerText(),"0:00","Minimize must not restart the duration");
 await member.page.getByRole("button",{name:"End call",exact:true}).click();
 await owner.page.getByRole("button",{name:"Dismiss call notice",exact:true}).click();
 await owner.page.getByRole("button",{name:"Start audio call",exact:true}).click();
 await member.page.getByRole("button",{name:"Decline",exact:true}).waitFor();
 const warmCall=(await pool.query("select id from audio_calls where conversation_id=$1 and state='ringing'",[callChat])).rows[0];
 const warmToken=randomUUID();
 await member.page.evaluate(async({user,call,token})=>{
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open("circlo-notification-privacy",1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const tx=database.transaction("locks","readwrite");tx.objectStore("locks").put({recipientId:user,token,expiresAt:Date.now()+30000},`call-action:${call}`);
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=reject;});database.close();
  history.replaceState(null,"",`${location.pathname}?call=${call}&callAction=answer&callActionToken=${token}`);
 },{user:member.id,call:warmCall.id,token:warmToken});
 for(const account of [owner,member])await account.page.getByText("Audio connected",{exact:true}).waitFor({timeout:45000});
 await member.page.getByRole("button",{name:"End call",exact:true}).click();
 await owner.page.getByRole("button",{name:"Dismiss call notice",exact:true}).click();
 await owner.page.getByRole("button",{name:"Start audio call",exact:true}).click();
 await member.page.getByRole("button",{name:"Decline",exact:true}).waitFor();
 await member.page.getByRole("button",{name:"Decline",exact:true}).click();
 await owner.page.getByRole("button",{name:"Dismiss call notice",exact:true}).waitFor();
 assert.equal((await pool.query("select count(*)::int as n from audio_calls where conversation_id=$1",[callChat])).rows[0].n,0);
 console.log("PASS: cold Answer launch establishes real WebRTC; decline works without SSE; ended signaling removed");
 await testNativeNotificationState(contexts[0],base,owner.id);
 await testUxFeatures(contexts[0],base,owner,member);
 await testCommunityUx(contexts[0],base,owner,member,pool);
 await testDeliveryApi(base,owner,member,accounts[2],pool,await encryptMessage("Background receipt fixture",key));
 await testTemporaryRooms(browser,base,pool);
 await testNavigationLatency(contexts[0],base,group);
 }
 assert.deepEqual(errors,[]);console.log("Browser reliability suite passed.");
} catch(error) { console.error("Workflow failed:",error);for(const [i,account] of accounts.entries()){if(account.page)await account.page.screenshot({path:`${process.env.TEMP??"."}/circlo-audit-failure-${i}.png`}).catch(()=>{});} throw error; } finally {
 if(browser)await browser.close();
 if(callChat)await pool.query("delete from conversations where id=$1",[callChat]);
 if(group)await pool.query("delete from conversations where id=$1",[group]);
 if(accounts.length)await pool.query("delete from users where id=any($1::uuid[])",[accounts.map(account=>account.id)]);
 await pool.end();
}
