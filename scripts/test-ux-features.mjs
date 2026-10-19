import assert from "node:assert/strict";
import {request} from "playwright";
import {randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";

export async function testUxFeatures(context,base,owner,member) {
 const page=await context.newPage();page.setDefaultTimeout(30000);await page.setViewportSize({width:360,height:800});
 try {
  const save=await page.request.post(`${base}/api/contacts`,{data:{userId:member.id},headers:{Origin:base}});assert.equal(save.status(),200);
  await page.goto(base+"/app/people");await page.getByRole("searchbox",{name:"Search people"}).waitFor();assert.equal(await page.getByRole("searchbox").count(),1,"People must have one search box on mobile");
  await page.getByText(member.name,{exact:true}).first().waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"People must not overflow the phone viewport");
  await mkdir("test-artifacts",{recursive:true});await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});await page.screenshot({path:"test-artifacts/ux-people-mobile.png"});
  const qr=await page.request.get(base+"/api/contacts/qr");assert.equal(qr.status(),200);assert.match(qr.headers()["content-type"],/image\/svg\+xml/);assert.match(await qr.text(),/<svg/);
  await page.getByRole("button",{name:"Contact QR",exact:true}).click();
  await page.getByLabel("Contact link or ID").fill("https://evil.example/contact/"+member.id);await page.getByRole("button",{name:"Open contact",exact:true}).click();await page.getByText("Use a valid Circlo contact link or contact ID.").waitFor();
  await page.getByLabel("Contact link or ID").fill(`${base}/contact/${member.id}`);await page.getByRole("button",{name:"Open contact",exact:true}).click();await page.getByRole("button",{name:"Add contact",exact:true}).click();await page.getByRole("button",{name:"Contact saved",exact:true}).waitFor();
  const contacts=await page.request.get(base+"/api/contacts");const saved=(await contacts.json()).users;assert(saved.some(user=>user.id===member.id));assert(saved.every(user=>user.lastSeenAt===null),"Contacts cannot bypass presence privacy");
  await page.goto(base+"/app/chats");await page.getByLabel("Search conversations",{exact:true}).waitFor();
  const help=page.getByRole("link",{name:"Open Circlo Help",exact:true});
  await help.click();await page.getByRole("heading",{name:"Circlo Help",exact:true}).waitFor();
  await page.goto(base+"/app/chats");await page.getByLabel("Search conversations",{exact:true}).waitFor();
  const filters=page.locator(".chat-filters");assert.equal(await filters.evaluate(element=>getComputedStyle(element).scrollbarWidth),"none");
  const bounds=await filters.boundingBox();assert(bounds);await filters.evaluate(element=>{element.scrollLeft=0;});await page.mouse.move(bounds.x+bounds.width-12,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+12,bounds.y+bounds.height/2,{steps:12});await page.mouse.up();
  assert(await filters.evaluate(element=>element.scrollWidth<=element.clientWidth||element.scrollLeft>0),"Filters must support mouse dragging");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:"test-artifacts/ux-inbox-mobile.png"});
  for (const width of [320,390,1280]) {
   await page.setViewportSize({width,height:width===1280?900:844});
   await page.evaluate(()=>{document.documentElement.classList.add("light");document.querySelector(".chat-filters").scrollLeft=0;});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Inbox must fit ${width}px`);
   const helpBounds=await help.boundingBox();const listBounds=await page.getByRole("complementary",{name:"Conversations"}).boundingBox();
   assert(helpBounds&&listBounds&&helpBounds.width>=44&&helpBounds.x>=listBounds.x&&helpBounds.x+helpBounds.width<=listBounds.x+listBounds.width&&helpBounds.y+helpBounds.height<=listBounds.y+listBounds.height,"Help must stay inside the chat list with an accessible touch target");
   const scroller=page.locator('aside[aria-label="Conversations"] > div.overflow-y-auto');
   const scrollBounds=await scroller.boundingBox();
   assert(scrollBounds&&scrollBounds.y+scrollBounds.height>helpBounds.y+helpBounds.height,"Help must float over the list without a full-width footer");
   await scroller.evaluate(element=>{element.scrollTop=element.scrollHeight;});
   const lastOptions=page.getByRole("complementary",{name:"Conversations"}).getByRole("button",{name:"Conversation options",exact:true}).last();
   await lastOptions.scrollIntoViewIfNeeded();
   assert(await lastOptions.evaluate(button=>{const box=button.getBoundingClientRect();return button.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));}),"The final conversation's controls remain reachable beside the floating Help button");
   await scroller.evaluate(element=>{element.scrollTop=0;});
   const heading=await page.getByRole("heading",{name:"Chats",exact:true}).boundingBox();
   const firstRow=await page.locator(".chat-list-row").first().boundingBox();
   assert(heading&&firstRow&&firstRow.y-heading.y<200,"Compact controls must leave room for conversations");
   await page.screenshot({path:`test-artifacts/inbox-minimal-${width}-light.png`,animations:"disabled"});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>document.documentElement.classList.remove("light"));
  await page.screenshot({path:"test-artifacts/inbox-minimal-390-dark.png",animations:"disabled"});
  await page.setViewportSize({width:360,height:800});
  const calls=page.getByRole("navigation",{name:"Mobile navigation"}).getByRole("link",{name:"Calls",exact:true});await calls.click();await page.getByRole("heading",{name:"Calls",exact:true}).waitFor();
  const history=await page.request.get(base+"/api/calls/history");assert.equal(history.status(),200);assert(Array.isArray((await history.json()).calls));
  await page.goto(base+"/app/settings");await page.getByText("Privacy preferences",{exact:true}).click();
  await page.getByRole("combobox",{name:"Last seen",exact:true}).selectOption("specific");
  await page.getByRole("group",{name:"Share last seen with"}).waitFor();
  await page.getByText("Saved ✓",{exact:true}).waitFor();
  await page.getByRole("checkbox",{name:member.name,exact:true}).check();await page.getByText("Saved ✓",{exact:true}).waitFor();
  const privacy=await page.request.get(base+"/api/privacy/settings");const settings=await privacy.json();assert.equal(settings.lastSeenVisibility,"specific");assert(settings.lastSeenContacts.includes(member.id));
  assert.equal((await page.request.put(base+"/api/privacy/settings",{data:{lastSeenVisibility:"invalid"},headers:{Origin:base}})).status(),422);
  await page.request.put(base+"/api/privacy/settings",{data:{lastSeenVisibility:"everyone",lastSeenContacts:[]},headers:{Origin:base}});
  await page.route("**/api/status",async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
  await page.goto(base+"/app/status");await page.getByRole("heading",{name:"Status",exact:true}).waitFor();await page.getByRole("heading",{name:"My Status",exact:true}).waitFor();
  await page.screenshot({path:"test-artifacts/ux-status-mobile.png"});
  console.log("PASS: mobile People search/layout, actual QR generation/manual contact addition, swipe filters, Calls navigation/history, selected-contact privacy persistence and status loading");
 }finally{await page.close();}
}


export async function testDeliveryApi(base,owner,member,recipient,pool,ciphertext) {
 const api=await request.newContext({baseURL:base,extraHTTPHeaders:{Cookie:`maddy_session=${recipient.token}`,Origin:base}});
 const conversation=randomUUID(),message=randomUUID(),notification=randomUUID();
 try{
  await pool.query("insert into conversations(id,type,created_by_id) values($1,'dm',$2)",[conversation,owner.id]);
  for(const id of [owner.id,recipient.id])await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())",[conversation,id]);
  await pool.query("insert into messages(id,conversation_id,sender_id,text,encrypted) values($1,$2,$3,$4,true)",[message,conversation,owner.id,ciphertext]);
  await pool.query("insert into notifications(id,user_id,actor_id,type,data) values($1,$2,$3,'message',$4::jsonb)",[notification,recipient.id,owner.id,JSON.stringify({messageId:message,conversationId:conversation})]);
  const response=await api.get(`/api/messages/delivery?notificationId=${notification}`);assert.equal(response.status(),200);assert.match(response.headers()["cache-control"],/no-store/);
  const received=await response.json();assert.equal(received.recipientId,recipient.id);assert.equal(received.envelopes[0].id,message);assert.equal(received.envelopes[0].text,ciphertext);assert.equal(received.envelopes[0].encrypted,true);
  assert.equal((await pool.query("select delivered_at from messages where id=$1",[message])).rows[0].delivered_at,null,"Fetching or presence alone must not stamp delivered");
  assert.equal((await owner.page.request.get(`${base}/api/messages/delivery?notificationId=${notification}`)).status(),404);
  const outsider=await member.page.request.post(base+"/api/messages/delivery",{headers:{Origin:base},data:{messageIds:[message]}});assert.equal(outsider.status(),200);assert.deepEqual((await outsider.json()).acknowledged,[]);
  assert.equal((await api.post("/api/messages/delivery",{data:{recipientId:owner.id,messageIds:[message]}})).status(),403);
  const posted=await api.post("/api/messages/delivery",{data:{recipientId:recipient.id,messageIds:[message]}});assert.equal(posted.status(),200);assert.deepEqual((await posted.json()).acknowledged,[message]);
  assert((await pool.query("select delivered_at from messages where id=$1",[message])).rows[0].delivered_at);
  assert.deepEqual((await (await api.post("/api/messages/delivery",{data:{recipientId:recipient.id,messageIds:[message]}})).json()).acknowledged,[]);
  await pool.query("update messages set delivered_at=null where id=$1",[message]);await pool.query("update conversation_members set cleared_at=now() where conversation_id=$1 and user_id=$2",[conversation,recipient.id]);
  assert.deepEqual((await (await api.get(`/api/messages/delivery?messageId=${message}`)).json()).envelopes,[]);
  assert.equal((await api.get("/api/messages/delivery?messageId=invalid")).status(),422);
  console.log("PASS: real background receipt API returns authorized ciphertext, requires explicit recipient acknowledgment, isolates account/notification ownership and hides cleared history");
 }finally{await api.dispose();await pool.query("delete from conversations where id=$1",[conversation]);await pool.query("delete from notifications where id=$1",[notification]);}
}
