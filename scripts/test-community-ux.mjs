import assert from "node:assert/strict";
export async function testCommunityUx(context,base,owner,member,pool){
 const page=await context.newPage();page.setDefaultTimeout(30000);await page.setViewportSize({width:360,height:800});let communityId,conversationId;
 try{
  const created=await page.request.post(base+"/api/communities",{headers:{Origin:base},data:{name:"Browser community",description:"Community rules"}});assert.equal(created.status(),201);communityId=(await created.json()).community.id;
  assert.equal((await member.page.request.post(`${base}/api/communities/${communityId}`,{headers:{Origin:base},data:{action:"join"}})).status(),200);
  const group=await page.request.post(`${base}/api/communities/${communityId}`,{headers:{Origin:base},data:{action:"create_channel",name:"Community group",description:"Be kind",type:"text"}});assert.equal(group.status(),201);conversationId=(await group.json()).channel.conversationId;
  await page.goto(`${base}/app/communities/${communityId}`);await page.getByRole("heading",{name:"Browser community",exact:true}).waitFor();await page.getByText(/2 members.*1.*group/).waitFor();
  await page.getByRole("button",{name:"Community settings",exact:true}).click();await page.getByLabel("Description and community rules").fill("Updated rules from the owner");await page.getByRole("button",{name:"Save rules",exact:true}).click();await page.getByText("Updated rules from the owner",{exact:true}).waitFor();
  if(await member.page.getByRole("button",{name:"Dismiss call notice",exact:true}).count())await member.page.getByRole("button",{name:"Dismiss call notice",exact:true}).click();
  const streamReady=member.page.waitForResponse(response=>response.url().endsWith("/api/realtime/stream")&&response.status()===200);
  await member.page.context().unroute("**/api/realtime/stream");
  await member.page.goto(`${base}/app/communities/${communityId}`);await streamReady;await member.page.getByRole("heading",{name:"Browser community",exact:true}).waitFor();assert.equal(await member.page.getByRole("button",{name:"Create group",exact:true}).count(),0);
  await page.getByRole("button",{name:"Make admin",exact:true}).click();await member.page.getByRole("button",{name:"Create group",exact:true}).waitFor();
  await page.screenshot({path:"test-artifacts/ux-community-mobile.png"});
  await page.goto(`${base}/app/chats/${conversationId}`);await page.getByRole("button",{name:"Open group settings",exact:true}).click();
  await page.getByRole("button",{name:/Invite links/}).click();await page.getByLabel("Invite expiry").selectOption("1");await page.getByLabel("Invite use limit").fill("1");await page.getByRole("button",{name:/Create invite link/}).click();
  const link=page.locator('a[href^="/invite/"]');await link.waitFor();const href=await link.getAttribute("href");assert.match(href,/^\/invite\/[a-f0-9]{32}$/);
  const invitations=await page.request.get(`${base}/api/groups/${conversationId}/invites`);const links=(await invitations.json()).links;assert.equal(links[0].maxUses,1);assert(Date.parse(links[0].expiresAt)>Date.now());
  assert.equal((await page.request.get(base+href)).status(),200);
  await page.getByRole("button",{name:"Revoke",exact:true}).click();await link.waitFor({state:"detached"});assert.equal((await page.request.get(base+href)).status(),404);
  await page.getByRole("button",{name:"More Scheduled messages",exact:true}).click();
  await page.getByRole("button",{name:"Scheduled messages",exact:true}).click();await page.getByRole("dialog",{name:"Manage scheduled messages",exact:true}).waitFor();
  const changed=await page.request.post(`${base}/api/conversations/${conversationId}/controls`,{headers:{Origin:base},data:{action:"setDisappearing",disappearingSeconds:86400}});assert.equal(changed.status(),200);
  for(const target of [page,member.page]){await target.goto(`${base}/app/chats/${conversationId}`);await target.locator("[data-message-id] p:visible").getByText("New messages disappear after 24 hours.",{exact:true}).first().waitFor();}
  console.log("PASS: actual community counts/rules, live admin controls, clickable expiring invite/revocation, accessible scheduling and policy notice on both browsers");
 }finally{await page.close();if(communityId)await pool.query("delete from communities where id=$1",[communityId]);if(conversationId)await pool.query("delete from conversations where id=$1",[conversationId]);}
}

