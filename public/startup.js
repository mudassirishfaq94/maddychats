// APK-only, read-only snapshot. The hosted app still performs all authorization.
import {activeAccount,offlineChats,offlineHistory,chatLocked} from './offline-store.js';
const bridge=window.CircloStartup,$=id=>document.getElementById(id);
const account=bridge?.accountHint?.();
const valid=()=>Boolean(account&&activeAccount()===account&&bridge.accountHint()===account);
let selected=null,version=0,chats=[];
const theme=()=>document.documentElement.classList.toggle('light',localStorage.getItem('maddy-theme')==='light');
theme();$('theme').onclick=()=>{localStorage.setItem('maddy-theme',document.documentElement.classList.contains('light')?'dark':'light');theme();};
const node=(tag,classes,text)=>{const el=document.createElement(tag);if(classes)el.className=classes;if(text!==undefined)el.textContent=text;return el;};
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(word=>word[0]??'').join('').toUpperCase();
const time=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}):'';};
const clear=()=>{version++;$('conversations').replaceChildren();$('messages').replaceChildren();$('chat-name').textContent='';selected=null;$('conversation').hidden=true;document.body.classList.remove('in-chat');};
function list(){
  if(!valid()){clear();bridge?.unavailable?.();return;}
  const q=$('search').value.trim().toLowerCase();$('conversations').replaceChildren();
  for(const chat of chats.filter(chat=>!chat.archived&&chat.name.toLowerCase().includes(q))){
    const locked=chat.locked||chatLocked(chat.id),row=node('button','chat-row chat-list-row');row.type='button';row.setAttribute('role','listitem');
    row.append(node('span','avatar',locked?'••':initials(chat.name)));
    const content=node('span','row-content'),top=node('span','row-top');top.append(node('span','row-name',locked?'Locked chat':chat.name));
    if(!locked)top.append(node('span','row-time',time(chat.lastMessageAt??chat.preview?.createdAt)));
    const preview=locked?'Unlock to open':chat.blocked?'Blocked':chat.requestPending?'Message request':chat.preview?.kind==='message'?chat.preview.text:chat.preview?.kind==='ephemeral'?'Open to see messages':chat.preview?.kind==='deleted'?'Message deleted':chat.preview?.kind==='media'?'Media':'Open chat';
    content.append(top,node('span','row-preview',preview));row.append(content);
    if(!locked&&chat.unreadCount)row.append(node('span','unread',String(chat.unreadCount>99?'99+':chat.unreadCount)));
    row.onclick=()=>void open(chat.id);$('conversations').append(row);
  }
}
async function open(id,push=true){
  const generation=++version;selected=id;
  $('conversation').hidden=!id;document.body.classList.toggle('in-chat',Boolean(id));$('messages').replaceChildren();
  if(!valid()){clear();bridge.unavailable();return;}
  if(push)history.pushState(null,'',id?'?chat='+encodeURIComponent(id):location.pathname);
  if(!id){bridge.openChat('');return;}
  const chat=chats.find(chat=>chat.id===id);if(!chat)return;
  $('chat-name').textContent=chat.locked||chatLocked(id)?'Locked chat':chat.name;$('chat-avatar').textContent=chat.locked||chatLocked(id)?'••':initials(chat.name);
  bridge.openChat(id);
  if(chat.locked||chatLocked(id)||chat.blocked||chat.requestPending)return;
  const snapshot=await offlineHistory(account,id);
  if(generation!==version||!valid()||chatLocked(id))return;
  for(const row of snapshot.messages.filter(row=>row.kind==='message'))$('messages').append(node('p','saved-bubble'+(row.mine?' mine':''),row.text));
  $('messages').scrollTop=$('messages').scrollHeight;
  if($('messages').childElementCount)requestAnimationFrame(()=>performance.mark('circlo-startup-message-visible'));
}
window.addEventListener('popstate',()=>void open(new URLSearchParams(location.search).get('chat'),false));
$('back').onclick=()=>void open(null);$('search').oninput=list;$('new-chat').onclick=()=>{if(valid())bridge.newChat();};
for(const [name,path] of [['Chats','/app/chats'],['Status','/app/status'],['Calls','/app/calls'],['Settings','/app/settings']]){const button=node('button','',name);button.type='button';if(name==='Chats')button.setAttribute('aria-current','page');button.onclick=()=>name==='Chats'?void open(null):valid()&&bridge.openPage(path);$('navigation').append(button);}
window.addEventListener('storage',event=>{if(event.key==='circlo:offline-account'||event.key==='maddy:locked-chats'){const prior=selected;clear();if(valid()){list();if(prior)void open(prior,false);}else bridge?.unavailable?.();}});
try{if(!bridge)location.replace('/app/chats');else if(!valid())bridge.unavailable();else{chats=await offlineChats(account);if(valid()){list();requestAnimationFrame(()=>{performance.mark('circlo-startup-list-visible');requestAnimationFrame(()=>{if(valid())bridge.listPainted?.();});});bridge.cacheReady(account);}else bridge.unavailable();}}catch{clear();bridge?.unavailable?.();}
