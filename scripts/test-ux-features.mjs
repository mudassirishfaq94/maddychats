import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";

export async function testUxFeatures(context,base,owner,member) {
 const page=await context.newPage();page.setDefaultTimeout(30000);await page.setViewportSize({width:360,height:800});
 try {
  const save=await page.request.post(`${base}/api/contacts`,{data:{userId:member.id},headers:{Origin:base}});assert.equal(save.status(),200);
  await page.goto(base+"/app/people");await page.getByRole("searchbox",{name:"Search people"}).waitFor();assert.equal(await page.getByRole("searchbox").count(),1,"People must have one search box on mobile");
  await page.getByText(member.name,{exact:true}).first().waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"People must not overflow the phone viewport");
  await mkdir("test-artifacts",{recursive:true});await page.screenshot({path:"test-artifacts/ux-people-mobile.png"});
  const qr=await page.request.get(base+"/api/contacts/qr");assert.equal(qr.status(),200);assert.match(qr.headers()["content-type"],/image\/svg\+xml/);assert.match(await qr.text(),/<svg/);
  await page.getByRole("button",{name:"Contact QR",exact:true}).click();
  await page.getByLabel("Contact link or ID").fill("https://evil.example/contact/"+member.id);await page.getByRole("button",{name:"Open contact",exact:true}).click();await page.getByText("Use a valid Circlo contact link or contact ID.").waitFor();
  await page.getByLabel("Contact link or ID").fill(`${base}/contact/${member.id}`);await page.getByRole("button",{name:"Open contact",exact:true}).click();await page.getByRole("button",{name:"Add contact",exact:true}).click();await page.getByRole("button",{name:"Contact saved",exact:true}).waitFor();
  const contacts=await page.request.get(base+"/api/contacts");const saved=(await contacts.json()).users;assert(saved.some(user=>user.id===member.id));assert(saved.every(user=>user.lastSeenAt===null),"Contacts cannot bypass presence privacy");
  await page.goto(base+"/app/chats");await page.getByLabel("Search conversations",{exact:true}).waitFor();
  const filters=page.locator(".chat-filters");assert.equal(await filters.evaluate(element=>getComputedStyle(element).scrollbarWidth),"none");
  const bounds=await filters.boundingBox();assert(bounds);await filters.evaluate(element=>{element.scrollLeft=0;});await page.mouse.move(bounds.x+bounds.width-12,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+12,bounds.y+bounds.height/2,{steps:12});await page.mouse.up();
  assert(await filters.evaluate(element=>element.scrollWidth<=element.clientWidth||element.scrollLeft>0),"Filters must support mouse dragging");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
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
