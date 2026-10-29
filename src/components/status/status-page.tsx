"use client";

import Image from "next/image";
import { STATUS_MEDIA_OUTPUT_MAX_BYTES } from "@/lib/media-limits";
import { StatusProgress } from "./status-progress";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, Eye, Image as ImageIcon, Loader2, Pause, Play, Plus, Search, Trash2, Type, Video, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useRealtime } from "@/components/providers/realtime-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import type { PublicUser, SafeUser, StatusDTO } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const backgrounds: Record<string, string> = {
  sunset: "linear-gradient(135deg,#ff6b6b,#7c3aed)", ocean: "linear-gradient(135deg,#0891b2,#1d4ed8)",
  forest: "linear-gradient(135deg,#15803d,#064e3b)", midnight: "linear-gradient(135deg,#111827,#312e81)", rose: "linear-gradient(135deg,#e11d48,#9333ea)",
};

export function StatusPage({ me, initial }: { me: SafeUser; initial: StatusDTO[] }) {
  const [adding,setAdding]=useState(false);
  const [items, setItems] = useState(initial);  const [create, setCreate] = useState<"text"|"image"|"video"|null>(null);
  const [viewer, setViewer] = useState<{ list: StatusDTO[]; index: number } | null>(null);
  const { subscribe } = useRealtime();
  async function reload() { const r = await fetch("/api/status", { cache: "no-store" }); if (r.ok) setItems((await r.json()).statuses); }
  useEffect(() => subscribe((e) => { if (e.type === "status:new" || e.type === "status:deleted") void reload(); }), [subscribe]);
  const mine = items.filter((s) => s.userId === me.id);
  const grouped = useMemo(() => { const map = new Map<string, StatusDTO[]>(); for (const s of items.filter((x) => x.userId !== me.id)) map.set(s.userId, [...(map.get(s.userId) ?? []), s]); return [...map.values()]; }, [items, me.id]);
  const recent = grouped.filter((g) => g.some((s) => !s.viewed)); const viewed = grouped.filter((g) => g.every((s) => s.viewed));
  return <div className="relative h-full overflow-y-auto"><div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
    <h1 className="font-display text-3xl font-bold">Status</h1><p className="mt-1 text-sm text-[var(--muted)]">Updates disappear after 24 hours.</p>
    <section className="mt-6"><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">My Status</h2>
      <button aria-label={mine.length ? "View my status" : "Add status"} onClick={() => mine.length ? setViewer({ list: mine, index: 0 }) : setAdding(true)} className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] p-3 text-left shadow-sm">
        <span className="relative"><Avatar user={me} size={48} />{!mine.length ? <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white"><Plus className="h-3 w-3" /></span> : null}</span>
        <span className="min-w-0 flex-1"><b className="block">Your status</b><small className="text-[var(--muted)]">{mine.length ? `${mine.length} update${mine.length === 1 ? "" : "s"} · ${timeAgo(mine[0].createdAt)} · ${mine.reduce((n,s)=>n+s.viewCount,0)} views` : "Tap to add a status update"}</small></span>
      </button>
    </section>
    <StatusSection title="Recent updates" groups={recent} open={(list) => setViewer({ list, index: 0 })} />
    <StatusSection title="Viewed updates" groups={viewed} open={(list) => setViewer({ list, index: 0 })} />
  </div>
  {mine.length > 0 ? <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-5 z-30 sm:bottom-6"><button onClick={()=>setAdding(true)} aria-label="Add status" className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xl"><Plus className="h-6 w-6"/></button></div> : null}
  {adding ? <StatusChoices onChoose={mode => {setAdding(false);setCreate(mode);}} onClose={()=>setAdding(false)}/> : null}
  {create ? <StatusCreator mode={create} onClose={() => setCreate(null)} onCreated={() => { setCreate(null); void reload(); }} /> : null}
  {viewer ? <StatusViewer me={me} list={viewer.list} initialIndex={viewer.index} onClose={() => { setViewer(null); void reload(); }} /> : null}
  </div>;
}

function StatusSection({ title, groups, open }: { title: string; groups: StatusDTO[][]; open: (list: StatusDTO[]) => void }) {
  if (!groups.length) return null;
  return <section className="mt-7"><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h2><div className="space-y-1">{groups.map((list) => { const latest=list[0]; return <button key={latest.userId} onClick={() => open(list)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-[var(--surface)]"><span className={cn("rounded-full p-0.5", list.some(s=>!s.viewed) ? "bg-[var(--accent)]" : "bg-[var(--muted)]")}><span className="block rounded-full bg-[var(--bg)] p-0.5"><Avatar user={latest.owner} size={44} /></span></span><span><b className="block text-sm">{latest.owner.displayName}</b><small className="text-[var(--muted)]">{timeAgo(latest.createdAt)} · {list.length} update{list.length===1?"":"s"}</small></span></button>; })}</div></section>;
}

function StatusChoices({onChoose,onClose}:{onChoose:(mode:"text"|"image"|"video")=>void;onClose:()=>void}) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return ()=>{if(previous instanceof HTMLElement)previous.focus();};
  },[]);
  return createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby="status-choices-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] shadow-2xl" onKeyDown={event=>{
      if(event.key==="Escape"){event.preventDefault();onClose();}
      if(event.key!=="Tab")return;
      const controls=panel.current?.querySelectorAll<HTMLButtonElement>("button");const first=controls?.[0],last=controls?.[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }}>
      <h2 id="status-choices-title" className="text-lg font-semibold">Add status</h2>
      <div className="mt-4 grid gap-2"><button className="btn btn-secondary min-h-12 w-full" onClick={()=>onChoose("text")}><Type className="h-5 w-5"/>Text</button><button className="btn btn-secondary min-h-12 w-full" onClick={()=>onChoose("image")}><Camera className="h-5 w-5"/>Photo</button><button className="btn btn-secondary min-h-12 w-full" onClick={()=>onChoose("video")}><Video className="h-5 w-5"/>Video</button></div>
      <button className="btn btn-ghost mt-3 min-h-11 w-full" onClick={onClose}>Cancel</button>
    </section>
  </div>,document.body);
}

function StatusCreator({ mode, onClose, onCreated }: { mode:"text"|"image"|"video"; onClose:()=>void; onCreated:()=>void }) {
  const [text,setText]=useState(""); const [style,setStyle]=useState("sunset"); const [file,setFile]=useState<File|null>(null); const [privacy,setPrivacy]=useState<"chats"|"selected">("chats");
  const [selected,setSelected]=useState<PublicUser[]>([]); const [query,setQuery]=useState(""); const [results,setResults]=useState<PublicUser[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  const filePreview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);
  useEffect(()=>{ if(privacy!=="selected"||query.trim().length<2)return; const c=new AbortController(); const t=setTimeout(()=>void fetch(`/api/users/search?q=${encodeURIComponent(query)}`,{signal:c.signal}).then(r=>r.json()).then(d=>setResults(d.users??[])).catch(()=>undefined),250); return()=>{clearTimeout(t);c.abort();};},[query,privacy]);
  async function submit(){setBusy(true);setError(null);try{let r:Response;if(mode==="text")r=await fetch("/api/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,backgroundStyle:style,privacy,selectedUserIds:selected.map(u=>u.id)})});else{if(!file)throw new Error(mode==="video"?"Choose a video.":"Choose a photo.");if(file.size>STATUS_MEDIA_OUTPUT_MAX_BYTES)throw new Error("Choose a photo or video up to 50 MB.");const f=new FormData();f.append("file",file);f.append("caption",text);f.append("privacy",privacy);f.append("selectedUserIds",JSON.stringify(selected.map(u=>u.id)));r=await fetch("/api/status",{method:"POST",body:f});}const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error??"Could not create status.");onCreated();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const accept = mode==="video"?"video/*":"image/jpeg,image/png,image/webp";
  const fileLabel = mode==="video"?"Choose video":"Choose photo";
  const FileIcon = mode==="video"?Video:ImageIcon;
  return <div role="dialog" aria-modal="true" aria-label="Create status" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3"><div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">{mode==="text"?"Text status":mode==="video"?"Video status":"Photo status"}</h2><button onClick={onClose} aria-label="Close status editor" className="flex h-11 w-11 items-center justify-center"><X className="h-5 w-5" /></button></div>
    {mode==="text"?<><textarea value={text} onChange={e=>setText(e.target.value)} maxLength={700} className="mt-4 min-h-48 w-full resize-none rounded-2xl p-6 text-center text-xl font-semibold text-white outline-none" style={{background:backgrounds[style]}} placeholder="Type a status…"/><div className="mt-3 flex flex-wrap gap-2">{Object.keys(backgrounds).map(k=><button key={k} aria-label={k} onClick={()=>setStyle(k)} className={cn("h-11 w-11 shrink-0 rounded-full",style===k&&"ring-2 ring-[var(--text)] ring-offset-2")} style={{background:backgrounds[k]}} />)}</div></>:<><label className="mt-4 flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-2)]">{file?(mode==="video"?<video src={filePreview!} className="h-full w-full object-contain" autoPlay muted playsInline />:<Image unoptimized width={1200} height={1200} src={filePreview!} className="h-full w-full object-contain" alt="Preview"/>):<span className="flex flex-col items-center text-sm text-[var(--muted)]"><FileIcon className="mb-2 h-7 w-7"/>{fileLabel}</span>}<input aria-label={fileLabel} className="sr-only" type="file" accept={accept} onChange={e=>setFile(e.target.files?.[0]??null)}/></label><input value={text} onChange={e=>setText(e.target.value)} maxLength={500} className="field-input mt-3" placeholder="Add a caption (optional)"/></>}
    {mode==="image"?<p className="mt-2 text-xs text-[var(--muted)]">JPG, PNG or WebP · Up to 50 MB. Photos are resized automatically.</p>:mode==="video"?<p className="mt-2 text-xs text-[var(--muted)]">Videos up to 50 MB.</p>:null}
    <select aria-label="Status audience" value={privacy} onChange={e=>setPrivacy(e.target.value as "chats"|"selected")} className="field-input mt-4"><option value="chats">People I chat with</option><option value="selected">Selected users</option></select>
    {privacy==="selected"?<div className="mt-2"><div className="flex flex-wrap gap-1">{selected.map(u=><button key={u.id} onClick={()=>setSelected(s=>s.filter(x=>x.id!==u.id))} className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs">{u.displayName} ×</button>)}</div><div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"/><input value={query} onChange={e=>{setQuery(e.target.value);if(e.target.value.trim().length<2)setResults([]);}} className="field-input field-input--icon" placeholder="Search people"/></div>{results.length?<div className="max-h-28 overflow-y-auto">{results.filter(u=>!selected.some(s=>s.id===u.id)).map(u=><button key={u.id} onClick={()=>setSelected(s=>[...s,u])} className="flex w-full items-center gap-2 p-2 text-left text-xs"><Avatar user={u} size={26}/>{u.displayName}</button>)}</div>:null}</div>:null}
    {error?<p className="mt-2 text-sm text-[var(--danger)]">{error}</p>:null}<button onClick={()=>void submit()} disabled={busy||(mode==="text"?!text.trim():!file)} className="btn btn-primary mt-4 w-full disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:"Share status"}</button></div></div>;
}

function StatusViewer({ me, list, initialIndex, onClose }: { me:SafeUser;list:StatusDTO[];initialIndex:number;onClose:()=>void }) {
  const [index,setIndex]=useState(initialIndex); const [paused,setPaused]=useState(false); const [viewers,setViewers]=useState<Array<{viewer:PublicUser;viewedAt:string}>|null>(null); const [reply,setReply]=useState(""); const [sending,setSending]=useState(false); const [replySent,setReplySent]=useState(false); const [replyError,setReplyError]=useState<string|null>(null); const [myReactions,setMyReactions]=useState<Record<string,string>>(()=>Object.fromEntries(list.map(s=>[s.id,s.reactions.find(r=>r.mine)?.emoji??""]))); const status=list[index]; const e2ee=useSharedE2EE();
  const [mediaState, setMediaState] = useState<{ id: string; phase: "ready" | "error"; attempt: number } | null>(null);
  const [retry, setRetry] = useState(0);
  const mediaReady = status.type === "text" || (mediaState?.id === status.id && mediaState.attempt === retry && mediaState.phase === "ready");
  const mediaFailed = mediaState?.id === status.id && mediaState.attempt === retry && mediaState.phase === "error";
  const mediaLoaded = () => setMediaState({ id: status.id, phase: "ready", attempt: retry });
  const mediaError = () => setMediaState({ id: status.id, phase: "error", attempt: retry });
  useEffect(() => {
    if (mediaReady || mediaFailed) return;
    // 8s is enough for a status image on a mobile connection; beyond that the
    // user gets a retry affordance instead of a 15s stall before anything paints.
    const timeout = setTimeout(() => setMediaState({ id: status.id, phase: "error", attempt: retry }), 8000);
    return () => clearTimeout(timeout);
  }, [mediaReady, mediaFailed, status.id, retry]);
  useEffect(()=>{if(mediaReady&&status.userId!==me.id)void fetch(`/api/status/${status.id}/view`,{method:"POST"});},[mediaReady,status.id,status.userId,me.id]);
  const isVideo=status.type==="video"; const duration=status.type==="text"?5000:7000;
  function move(delta:number){const next=index+delta;if(next<0||next>=list.length){onClose();return;}setViewers(null);setIndex(next);}
  async function loadViewers(){const r=await fetch(`/api/status/${status.id}/viewers`);if(r.ok)setViewers((await r.json()).viewers);}
  async function remove(){if(await fetch(`/api/status/${status.id}`,{method:"DELETE"}).then(r=>r.ok))onClose();}
  async function react(emoji:string){const next=myReactions[status.id]===emoji?null:emoji;const r=await fetch(`/api/status/${status.id}/reaction`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({emoji:next})});if(r.ok)setMyReactions(v=>({...v,[status.id]:next??""}));}
  async function sendReply(){if(!reply.trim()||sending)return;setSending(true);setReplyError(null);try{if(!e2ee.initialized)throw new Error(e2ee.loading?"Encryption is still initializing.":e2ee.error??"Encryption is unavailable on this device.");const conversationResponse=await fetch("/api/conversations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:status.userId})});const conversationData=await conversationResponse.json().catch(()=>null);const conversationId=conversationData?.conversation?.id as string|undefined;if(!conversationResponse.ok||!conversationId)throw new Error(conversationData?.error??"Could not open the reply conversation.");const prepared=await e2ee.prepareConversation(conversationId);if(!prepared.ready)throw new Error("Encryption keys are not ready for this reply yet.");const statusText=status.type==="text"?(status.text??""):(status.text||(status.type==="video"?"Video":"Photo"));const formatted=`[STATUS_REPLY:${status.type}]${statusText.slice(0,150)}[/STATUS_REPLY]\n${reply.trim()}`;const cipher=await e2ee.encrypt(formatted,conversationId);const response=await fetch(`/api/conversations/${conversationId}/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:cipher,encrypted:true})});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.error??"Could not send the encrypted reply.");setReply("");setReplySent(true);setTimeout(()=>setReplySent(false),1800);}catch(cause){setReplyError(cause instanceof Error?cause.message:"Could not send the encrypted reply.");}finally{setSending(false);}}
  function advance(){if(index<list.length-1){setViewers(null);setIndex(i=>i+1);}else onClose();}
  return <div className="fixed inset-0 z-[150] flex bg-black text-white"><div className="relative mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-neutral-950">
    <div className="absolute inset-x-0 top-0 z-20 p-3"><div className="flex gap-1">{list.map((_,i)=><span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">{i===index&&!isVideo?<StatusProgress key={status.id} duration={duration} paused={paused||!mediaReady||Boolean(reply.trim())||Boolean(viewers)} onComplete={advance}/>:<span className="block h-full bg-white" style={{width:i<index?"100%":"0%"}}/>}</span>)}</div><div className="mt-3 flex items-center gap-2"><Avatar user={status.owner} size={34}/><span className="min-w-0 flex-1"><b className="block text-sm">{status.userId===me.id?"Your status":status.owner.displayName}</b><small className="text-white/65">{timeAgo(status.createdAt)}</small></span>{status.userId===me.id?<><button onClick={()=>void loadViewers()} className="flex items-center gap-1 text-xs"><Eye className="h-4 w-4"/>{status.viewCount}</button><button onClick={()=>void remove()}><Trash2 className="h-4 w-4"/></button></>:null}{!isVideo?<button className="flex h-11 w-11 items-center justify-center" aria-label={paused?"Resume status":"Pause status"} onClick={()=>{setPaused(p=>!p);}}>{paused?<Play className="h-5 w-5"/>:<Pause className="h-5 w-5"/>}</button>:null}<button onClick={onClose} aria-label="Close status" className="flex h-11 w-11 items-center justify-center"><X className="h-6 w-6"/></button></div></div>
    <button aria-label="Previous status" onClick={()=>move(-1)} className="absolute left-2 top-1/2 z-20 rounded-full bg-black/25 p-2"><ChevronLeft/></button><button aria-label="Next status" onClick={()=>move(1)} className="absolute right-2 top-1/2 z-20 rounded-full bg-black/25 p-2"><ChevronRight/></button>
    {status.type==="image"?<div className="flex h-full items-center justify-center pb-28"><Image key={`${status.id}:${retry}`} unoptimized loading="eager" onLoad={mediaLoaded} onError={mediaError} width={1200} height={1200} src={status.mediaUrl!} alt={status.text??"Status"} className="max-h-full max-w-full object-contain"/>{status.text?<p className="absolute bottom-32 left-4 right-4 rounded-xl bg-black/45 p-3 text-center">{status.text}</p>:null}</div>:status.type==="video"?<div className="flex h-full items-center justify-center pb-28"><video key={`${status.id}:${retry}`} src={status.mediaUrl!} preload="metadata" onLoadedData={mediaLoaded} onWaiting={()=>setMediaState(null)} onPlaying={mediaLoaded} onError={mediaError} controls autoPlay muted playsInline onEnded={()=>advance()} className="max-h-full max-w-full object-contain"/>{status.text?<p className="absolute bottom-32 left-4 right-4 rounded-xl bg-black/45 p-3 text-center">{status.text}</p>:null}</div>:<div className="flex h-full items-center justify-center p-10 pb-28 text-center text-3xl font-bold" style={{background:backgrounds[status.backgroundStyle??"sunset"]??backgrounds.sunset}}>{status.text}</div>}
    {!mediaReady ? <div role="status" className="absolute inset-x-12 top-1/2 -translate-y-1/2 rounded-2xl bg-neutral-900/95 p-6 text-center text-sm text-white shadow-lg">
      {mediaFailed ? <><p>Could not load this status. Check your connection and try again. It may also have expired.</p><button className="mt-3 rounded-full bg-white px-5 py-2 font-semibold text-black" onClick={()=>setRetry(value=>value+1)}>Try again</button></> : <><Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin"/><p>Loading status…</p></>}
    </div> : null}
    {status.userId!==me.id?<div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 to-transparent px-4 pb-4 pt-10"><div className="mb-2 flex justify-center gap-2">{["❤️","😂","😮","😢","🔥","👍"].map(emoji=><button key={emoji} onClick={()=>void react(emoji)} className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-lg transition-transform hover:scale-110",myReactions[status.id]===emoji&&"bg-white/35 ring-2 ring-white")}>{emoji}</button>)}</div>{replyError?<p className="mb-2 text-center text-xs text-red-300">{replyError}</p>:null}<div className="flex items-center gap-2"><input value={reply} onChange={e=>setReply(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void sendReply();}} maxLength={1800} className="min-w-0 flex-1 rounded-full border border-white/30 bg-black/30 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/60" placeholder={replySent?"Reply sent ✓":"Reply to status…"}/><button onClick={()=>void sendReply()} disabled={sending||!reply.trim()} className="rounded-full bg-white px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50">{sending?<Loader2 className="h-4 w-4 animate-spin"/>:"Send"}</button></div></div>:status.reactions.length?<div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full bg-black/45 px-3 py-2">{status.reactions.map(r=><span key={r.emoji} className="text-sm">{r.emoji} {r.count}</span>)}</div>:null}
    {viewers?<div className="absolute inset-x-0 bottom-0 z-30 max-h-1/2 overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-4 text-[var(--text)]"><div className="flex justify-between"><b>Viewed by</b><button onClick={()=>setViewers(null)}><X className="h-4 w-4"/></button></div>{viewers.length?viewers.map(v=><div key={v.viewer.id} className="flex items-center gap-2 py-2"><Avatar user={v.viewer} size={30}/><span className="flex-1 text-sm">{v.viewer.displayName}</span><small className="text-[var(--muted)]">{timeAgo(v.viewedAt)}</small></div>):<p className="py-6 text-center text-sm text-[var(--muted)]">No views yet</p>}</div>:null}
  </div></div>;
}
