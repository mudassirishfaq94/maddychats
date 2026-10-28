/* eslint-disable @next/next/no-location-assign-relative-destination -- Public offline app has no Next runtime. */
import {activeAccount,offlineChats,offlineHistory,enqueueText,queuedTexts,removeText,chatLocked,offlineDraft,saveOfflineDraft,offlineStorageWarning} from "./offline-store.js";
const $=id=>document.getElementById(id);
const icons={chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3l2 5-2 2a16 16 0 0 0 6 6l2-2 5 2Z"/>',people:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a18 18 0 0 1 0 20 18 18 0 0 1 0-20"/>',status:'<circle cx="12" cy="12" r="9" stroke-dasharray="4 4"/>',settings:'<circle cx="12" cy="12" r="4"/><path d="m9 2-1 3-3 1-3 3 2 3-1 4 4 2 2 4h6l2-4 4-2-1-4 2-3-3-3-3-1-1-3Z"/>',back:'<path d="m15 18-6-6 6-6"/>',send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',attach:'<path d="m21 11-9 9a6 6 0 0 1-9-9L13 1a4 4 0 0 1 6 6L9 17a2 2 0 0 1-3-3l9-9"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',edit:'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M16 2l6 6-10 10H6v-6Z"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>'};
function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';}
for(const [id,name] of [["back","back"],["send","send"],["attach","attach"],["call","phone"],["new-chat","edit"],["theme","sun"]])$(id).innerHTML=icon(name);
let theme=localStorage.getItem("maddy-theme")??"dark";
function applyTheme(){document.documentElement.classList.toggle("light",theme==="light"||(theme==="system"&&matchMedia("(prefers-color-scheme: light)").matches));}
applyTheme();$("theme").onclick=()=>{theme=document.documentElement.classList.contains("light")?"dark":"light";localStorage.setItem("maddy-theme",theme);applyTheme();};
const userId=activeAccount();const drafts=new Map();let chats=[],selected=null,filter="all",renderVersion=0,reconnecting=false,toastTimer;
function toast(message){$("feedback").textContent=message;$("feedback").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("feedback").hidden=true,4000);}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function time(iso){return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(new Date(iso));}
function initials(name){return name.split(/\s+/).slice(0,2).map(part=>part[0]??"").join("").toUpperCase();}
function description(message){return message.kind==="deleted"?"Message deleted":message.kind==="ephemeral"?"Private message · connect to view":message.kind==="media"?"Attachment · available online":message.text;}
for(const [key,label] of [["all","All"],["unread","Unread"],["groups","Groups"],["dms","Direct"]]){const button=node("button","",label);button.type="button";button.setAttribute("aria-pressed",String(key===filter));button.onclick=()=>{filter=key;for(const b of $("filters").children)b.setAttribute("aria-pressed",String(b===button));void renderList();};$("filters").append(button);}
for(const [label,name] of [["Chats","chat"],["Calls","phone"],["Community","globe"],["People","people"],["Status","status"],["Settings","settings"]]){const button=node("button");button.type="button";button.innerHTML=icon(name);button.append(node("span","",label));if(label==="Chats")button.setAttribute("aria-current","page");button.onclick=()=>label==="Chats"?void openChat(null):toast(label+" needs an internet connection.");$("navigation").append(button);}
async function renderList(){
  const queued=userId?await queuedTexts(userId):[];
  const query=$("search").value.trim().toLowerCase();$("conversations").replaceChildren();
  const list=[...chats];for(const entry of queued)if(!list.some(chat=>chat.id===entry.conversationId))list.push({id:entry.conversationId,name:"Unavailable chat",blocked:true});
  for(const chat of list){
    if(chat.archived||!chat.name.toLowerCase().includes(query)||(filter==="unread"&&!chat.unreadCount)||(filter==="favorites"&&!chat.favorited)||(filter==="groups"&&chat.type!=="group")||(filter==="dms"&&chat.type!=="dm"))continue;
    const locked=chatLocked(chat.id),pending=queued.filter(entry=>entry.conversationId===chat.id).at(-1);
    const row=node("button","chat-row");row.type="button";row.setAttribute("role","listitem");row.setAttribute("aria-label",locked?"Locked chat":chat.name);row.onclick=()=>void openChat(chat.id);
    row.append(node("span","avatar",locked?"••":initials(chat.name)));
    const content=node("span","row-content"),top=node("span","row-top");top.append(node("span","row-name",locked?"Locked chat":chat.name));
    const date=pending?.createdAt??chat.preview?.createdAt??chat.lastMessageAt;if(date&&!locked)top.append(node("span","row-time",time(date)));
    content.append(top,node("span","row-preview",locked?"Unlock online to open this chat":chat.requestPending?"Message request":pending?(pending.failed?"Not sent: ":"Queued: ")+pending.text:chat.preview?description(chat.preview):"Open conversation"));row.append(content);
    if(chat.unreadCount&&!locked)row.append(node("span","unread",String(chat.unreadCount)));$("conversations").append(row);
  }
  $("empty-list").hidden=$("conversations").childElementCount>0;$("empty-list").textContent=!userId?"Connect and sign in once to save your conversations on this device.":chats.length?"No matching conversations.":"Your conversations have not been saved on this device yet. Reconnect to load them.";
}
async function openChat(id,push=true){
  if(selected){drafts.set(selected,$("text").value);void saveOfflineDraft(userId,selected,$("text").value).catch(()=>toast("Could not save your draft on this device."));}
  selected=id;document.body.classList.toggle("in-chat",Boolean(id));$("conversation").hidden=!id;$("choose-chat").hidden=Boolean(id);
  if(push)history.pushState({},"",id?"/app/chats/"+id:"/app/chats");
  const version=++renderVersion;if(!id){$("messages").replaceChildren();$("chat-name").textContent="";$("text").value="";return;}
  const chat=chats.find(c=>c.id===id)??{id,name:"Unavailable chat",blocked:true};const locked=chatLocked(id);
  $("chat-name").textContent=locked?"Locked chat":chat.name;$("chat-avatar").textContent=locked?"••":initials(chat.name);
  $("chat-status").textContent=locked?"Locked":chat.type==="group"?"Group · offline":"Offline";$("messages").replaceChildren();
  const disabled=locked||chat.blocked||chat.requestPending;$("text").disabled=$("send").disabled=Boolean(disabled);$("text").value="";
  if(locked||chat.requestPending||!chats.some(c=>c.id===id)){$("messages").append(node("p","history-note",locked?"Unlock this chat online to view it.":chat.requestPending?"Connect to review this message request.":"This conversation is unavailable. Reconnect to check your access."));return;}
  const snapshot=await offlineHistory(userId,id),pending=(await queuedTexts(userId)).filter(entry=>entry.conversationId===id);
  const draft=drafts.has(id)?drafts.get(id):await offlineDraft(userId,id);
  if(version!==renderVersion||chatLocked(id))return;
  if(!$("text").value)$("text").value=draft;
  if(snapshot.syncedAt)$("messages").append(node("p","history-note","Saved on this device · last synced "+time(snapshot.syncedAt)));
  else $("messages").append(node("p","history-note","Earlier messages have not been saved on this device. Reconnect to load them."));
  let day="";
  for(const message of [...snapshot.messages,...pending.map(entry=>({...entry,mine:true,kind:"message",queued:true}))]){
    const date=new Date(message.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric"});if(date!==day){day=date;$("messages").append(node("div","date",day));}
    const group=node("div","message-group"+(message.mine?" mine":"")),bubble=node("div","bubble");
    if(chat.type==="group"&&!message.mine)bubble.append(node("span","sender",message.senderName));
    bubble.append(node("span","message-text",description(message)));const meta=node("span","message-meta");meta.append(node("span","",time(message.createdAt)));if(message.queued){const clock=node("span");clock.innerHTML=icon("clock");meta.append(clock,node("span","",message.failed?"Not sent":"Queued"));}bubble.append(meta);group.append(bubble);
    if(message.queued){group.append(node("p","queue-note",message.failed?(message.reason??"Reconnect and open this chat to retry the message."):"No internet connection. This message will send automatically when you're back online."));const cancel=node("button","cancel","Cancel queued message");cancel.type="button";cancel.onclick=async()=>{await removeText(userId,message.id);await openChat(id,false);await renderList();};group.append(cancel);}
    $("messages").append(group);
  }
  $("messages").scrollTop=$("messages").scrollHeight;
}
async function reload(){if(!userId){await renderList();return;}chats=await offlineChats(userId);await renderList();if(selected)await openChat(selected,false);const warning=offlineStorageWarning();if(warning)toast(warning);}
$("search").oninput=()=>void renderList();$("home").onclick=event=>{event.preventDefault();void openChat(null);};$("back").onclick=()=>void openChat(null);
function canSend(id){const chat=chats.find(c=>c.id===id);return Boolean(chat&&!chat.blocked&&!chat.requestPending&&!chatLocked(id));}
async function submit(event){
  event.preventDefault();const id=selected,value=$("text").value;if(!canSend(id)||!value.trim())return;
  $("send").disabled=true;
  try{
    await enqueueText(userId,id,value);
    if(drafts.get(id)===value){await saveOfflineDraft(userId,id,"");drafts.set(id,"");if(selected===id&&$("text").value===value)$("text").value="";}
    if(selected===id){await openChat(id,false);$("text").focus();}await renderList();
  }catch{toast("Couldn't save your message. Keep your text here and try again.");}
  finally{$("send").disabled=!canSend(selected);}
}
$("text").oninput=()=>{if(selected){drafts.set(selected,$("text").value);void saveOfflineDraft(userId,selected,$("text").value).catch(()=>toast("Could not save your draft on this device."));}};
$("compose").onsubmit=submit;$("text").onkeydown=event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();void submit(event);}};
for(const id of ["attach","call","new-chat"])$(id).onclick=()=>toast(id==="attach"?"Reconnect to attach a file.":id==="call"?"Calls need an internet connection.":"Reconnect to start a new conversation.");
async function reconnect(force=false){if(reconnecting||!navigator.onLine||(new URL(location.href).searchParams.get("queue")==="1"&&force!==true))return;reconnecting=true;try{const response=await fetch("/api/auth/me",{cache:"no-store",signal:AbortSignal.timeout(5000)});if(response.status===401){location.replace("/login?next="+encodeURIComponent(selected?"/app/chats/"+selected:"/app/chats"));return;}if(!response.ok)return;const data=await response.json();if(data.user?.id===userId){if(selected)await saveOfflineDraft(userId,selected,$("text").value);location.replace(selected?"/app/chats/"+selected:"/app/chats");}else toast("Sign in to the original account to send saved messages.");}catch{}finally{reconnecting=false;}}
$("retry").onclick=()=>userId?void reconnect(true):location.assign("/login");window.addEventListener("online",()=>void reconnect());setInterval(()=>void reconnect(),10000);
function privacyChanged(){
  $("messages").replaceChildren();$("conversations").replaceChildren();$("chat-name").textContent="Locked chat";$("text").value="";$("text").disabled=$("send").disabled=true;
  if(activeAccount()!==userId){location.reload();return;}void reload();
}
window.addEventListener("storage",event=>{if(event.key==="maddy:locked-chats"||event.key==="circlo:offline-account")privacyChanged();});window.addEventListener("maddy:locked-chats",privacyChanged);window.addEventListener("popstate",()=>void openChat(location.pathname.match(/^\/app\/chats\/([0-9a-f-]{36})$/i)?.[1]??null,false));
if(window.visualViewport)window.visualViewport.addEventListener("resize",()=>document.body.classList.toggle("keyboard",window.visualViewport.height<innerHeight-120));
try{await reload();const id=location.pathname.match(/^\/app\/chats\/([0-9a-f-]{36})$/i)?.[1];if(id)await openChat(id,false);void reconnect();}catch{toast("Device storage is unavailable. Reconnect to open Circlo.");}
