"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Eye, Image as ImageIcon, Loader2, Pause, Play, Plus, Search, Trash2, Type, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useRealtime } from "@/components/providers/realtime-provider";
import type { PublicUser, SafeUser, StatusDTO } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const backgrounds: Record<string, string> = {
  sunset: "linear-gradient(135deg,#ff6b6b,#7c3aed)", ocean: "linear-gradient(135deg,#0891b2,#1d4ed8)",
  forest: "linear-gradient(135deg,#15803d,#064e3b)", midnight: "linear-gradient(135deg,#111827,#312e81)", rose: "linear-gradient(135deg,#e11d48,#9333ea)",
};

export function StatusPage({ me, initial }: { me: SafeUser; initial: StatusDTO[] }) {
  const [items, setItems] = useState(initial); const [create, setCreate] = useState<"text"|"image"|null>(null);
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
      <button onClick={() => mine.length ? setViewer({ list: mine, index: 0 }) : setCreate("text")} className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] p-3 text-left shadow-sm">
        <span className="relative"><Avatar user={me} size={48} /><span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white"><Plus className="h-3 w-3" /></span></span>
        <span className="min-w-0 flex-1"><b className="block">Your status</b><small className="text-[var(--muted)]">{mine.length ? `${mine.length} update${mine.length === 1 ? "" : "s"} · ${timeAgo(mine[0].createdAt)} · ${mine.reduce((n,s)=>n+s.viewCount,0)} views` : "Tap to add a status update"}</small></span>
      </button>
    </section>
    <StatusSection title="Recent updates" groups={recent} open={(list) => setViewer({ list, index: 0 })} />
    <StatusSection title="Viewed updates" groups={viewed} open={(list) => setViewer({ list, index: 0 })} />
  </div>
  <div className="fixed bottom-6 right-5 z-30 flex flex-col gap-2"><button onClick={() => setCreate("text")} aria-label="Add text status" className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] shadow-lg"><Type className="h-5 w-5" /></button><button onClick={() => setCreate("image")} aria-label="Add photo status" className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-xl"><Camera className="h-6 w-6" /></button></div>
  {create ? <StatusCreator mode={create} onClose={() => setCreate(null)} onCreated={() => { setCreate(null); void reload(); }} /> : null}
  {viewer ? <StatusViewer me={me} list={viewer.list} initialIndex={viewer.index} onClose={() => { setViewer(null); void reload(); }} /> : null}
  </div>;
}

function StatusSection({ title, groups, open }: { title: string; groups: StatusDTO[][]; open: (list: StatusDTO[]) => void }) {
  if (!groups.length) return null;
  return <section className="mt-7"><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h2><div className="space-y-1">{groups.map((list) => { const latest=list[0]; return <button key={latest.userId} onClick={() => open(list)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-[var(--surface)]"><span className={cn("rounded-full p-0.5", list.some(s=>!s.viewed) ? "bg-[var(--accent)]" : "bg-[var(--muted)]")}><span className="block rounded-full bg-[var(--bg)] p-0.5"><Avatar user={latest.owner} size={44} /></span></span><span><b className="block text-sm">{latest.owner.displayName}</b><small className="text-[var(--muted)]">{timeAgo(latest.createdAt)} · {list.length} update{list.length===1?"":"s"}</small></span></button>; })}</div></section>;
}

function StatusCreator({ mode, onClose, onCreated }: { mode:"text"|"image"; onClose:()=>void; onCreated:()=>void }) {
  const [text,setText]=useState(""); const [style,setStyle]=useState("sunset"); const [file,setFile]=useState<File|null>(null); const [privacy,setPrivacy]=useState<"all"|"selected">("all");
  const [selected,setSelected]=useState<PublicUser[]>([]); const [query,setQuery]=useState(""); const [results,setResults]=useState<PublicUser[]>([]); const [busy,setBusy]=useState(false); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{ if(privacy!=="selected"||query.trim().length<2)return; const c=new AbortController(); const t=setTimeout(()=>void fetch(`/api/users/search?q=${encodeURIComponent(query)}`,{signal:c.signal}).then(r=>r.json()).then(d=>setResults(d.users??[])).catch(()=>undefined),250); return()=>{clearTimeout(t);c.abort();};},[query,privacy]);
  async function submit(){setBusy(true);setError(null);try{let r:Response;if(mode==="text")r=await fetch("/api/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,backgroundStyle:style,privacy,selectedUserIds:selected.map(u=>u.id)})});else{if(!file)throw new Error("Choose a photo.");const f=new FormData();f.append("file",file);f.append("caption",text);f.append("privacy",privacy);f.append("selectedUserIds",JSON.stringify(selected.map(u=>u.id)));r=await fetch("/api/status",{method:"POST",body:f});}const d=await r.json().catch(()=>null);if(!r.ok)throw new Error(d?.error??"Could not create status.");onCreated();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3"><div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">{mode==="text"?"Text status":"Photo status"}</h2><button onClick={onClose}><X className="h-5 w-5" /></button></div>
    {mode==="text"?<><textarea value={text} onChange={e=>setText(e.target.value)} maxLength={700} className="mt-4 min-h-48 w-full resize-none rounded-2xl p-6 text-center text-xl font-semibold text-white outline-none" style={{background:backgrounds[style]}} placeholder="Type a status…"/><div className="mt-3 flex gap-2">{Object.keys(backgrounds).map(k=><button key={k} aria-label={k} onClick={()=>setStyle(k)} className={cn("h-7 w-7 rounded-full",style===k&&"ring-2 ring-[var(--text)] ring-offset-2")} style={{background:backgrounds[k]}} />)}</div></>:<><label className="mt-4 flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-2)]">{file?<img src={URL.createObjectURL(file)} className="h-full w-full object-contain" alt="Preview"/>:<span className="flex flex-col items-center text-sm text-[var(--muted)]"><ImageIcon className="mb-2 h-7 w-7"/>Choose photo</span>}<input className="sr-only" type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><input value={text} onChange={e=>setText(e.target.value)} maxLength={500} className="field-input mt-3" placeholder="Add a caption (optional)"/></>}
    <select value={privacy} onChange={e=>setPrivacy(e.target.value as "all"|"selected")} className="field-input mt-4"><option value="all">All users</option><option value="selected">Selected users</option></select>
    {privacy==="selected"?<div className="mt-2"><div className="flex flex-wrap gap-1">{selected.map(u=><button key={u.id} onClick={()=>setSelected(s=>s.filter(x=>x.id!==u.id))} className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs">{u.displayName} ×</button>)}</div><div className="relative mt-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"/><input value={query} onChange={e=>{setQuery(e.target.value);if(e.target.value.trim().length<2)setResults([]);}} className="field-input field-input--icon" placeholder="Search people"/></div>{results.length?<div className="max-h-28 overflow-y-auto">{results.filter(u=>!selected.some(s=>s.id===u.id)).map(u=><button key={u.id} onClick={()=>setSelected(s=>[...s,u])} className="flex w-full items-center gap-2 p-2 text-left text-xs"><Avatar user={u} size={26}/>{u.displayName}</button>)}</div>:null}</div>:null}
    {error?<p className="mt-2 text-sm text-[var(--danger)]">{error}</p>:null}<button onClick={()=>void submit()} disabled={busy||(mode==="text"?!text.trim():!file)} className="btn btn-primary mt-4 w-full disabled:opacity-50">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:"Share status"}</button></div></div>;
}

function StatusViewer({ me, list, initialIndex, onClose }: { me:SafeUser;list:StatusDTO[];initialIndex:number;onClose:()=>void }) {
  const [index,setIndex]=useState(initialIndex); const [paused,setPaused]=useState(false); const [progress,setProgress]=useState(0); const [viewers,setViewers]=useState<Array<{viewer:PublicUser;viewedAt:string}>|null>(null); const status=list[index]; const start=useRef(0);
  useEffect(()=>{start.current=Date.now();if(status.userId!==me.id)void fetch(`/api/status/${status.id}/view`,{method:"POST"});},[status.id,status.userId,me.id]);
  useEffect(()=>{if(paused)return;const duration=status.type==="text"?5000:7000;const timer=setInterval(()=>{const p=Math.min(100,((Date.now()-start.current)/duration)*100);setProgress(p);if(p>=100){clearInterval(timer);if(index<list.length-1){setProgress(0);setViewers(null);setIndex(i=>i+1);}else onClose();}},80);return()=>clearInterval(timer);},[paused,status.id,status.type,index,list.length,onClose]);
  function move(delta:number){const next=index+delta;if(next<0||next>=list.length){onClose();return;}setProgress(0);setViewers(null);setIndex(next);}
  async function loadViewers(){const r=await fetch(`/api/status/${status.id}/viewers`);if(r.ok)setViewers((await r.json()).viewers);}
  async function remove(){if(await fetch(`/api/status/${status.id}`,{method:"DELETE"}).then(r=>r.ok))onClose();}
  return <div className="fixed inset-0 z-[150] flex bg-black text-white"><div className="relative mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden bg-neutral-950">
    <div className="absolute inset-x-0 top-0 z-20 p-3"><div className="flex gap-1">{list.map((_,i)=><span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"><span className="block h-full bg-white" style={{width:`${i<index?100:i===index?progress:0}%`}}/></span>)}</div><div className="mt-3 flex items-center gap-2"><Avatar user={status.owner} size={34}/><span className="min-w-0 flex-1"><b className="block text-sm">{status.userId===me.id?"Your status":status.owner.displayName}</b><small className="text-white/65">{timeAgo(status.createdAt)}</small></span>{status.userId===me.id?<><button onClick={()=>void loadViewers()} className="flex items-center gap-1 text-xs"><Eye className="h-4 w-4"/>{status.viewCount}</button><button onClick={()=>void remove()}><Trash2 className="h-4 w-4"/></button></>:null}<button onClick={()=>{setPaused(p=>!p);start.current=Date.now()-(progress/100)*(status.type==="text"?5000:7000);}}>{paused?<Play className="h-5 w-5"/>:<Pause className="h-5 w-5"/>}</button><button onClick={onClose}><X className="h-6 w-6"/></button></div></div>
    <button aria-label="Previous status" onClick={()=>move(-1)} className="absolute left-2 top-1/2 z-20 rounded-full bg-black/25 p-2"><ChevronLeft/></button><button aria-label="Next status" onClick={()=>move(1)} className="absolute right-2 top-1/2 z-20 rounded-full bg-black/25 p-2"><ChevronRight/></button>
    {status.type==="image"?<div className="flex h-full items-center justify-center"><img src={status.mediaUrl!} alt={status.text??"Status"} className="max-h-full max-w-full object-contain"/>{status.text?<p className="absolute bottom-8 left-4 right-4 rounded-xl bg-black/45 p-3 text-center">{status.text}</p>:null}</div>:<div className="flex h-full items-center justify-center p-10 text-center text-3xl font-bold" style={{background:backgrounds[status.backgroundStyle??"sunset"]??backgrounds.sunset}}>{status.text}</div>}
    {viewers?<div className="absolute inset-x-0 bottom-0 z-30 max-h-1/2 overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-4 text-[var(--text)]"><div className="flex justify-between"><b>Viewed by</b><button onClick={()=>setViewers(null)}><X className="h-4 w-4"/></button></div>{viewers.length?viewers.map(v=><div key={v.viewer.id} className="flex items-center gap-2 py-2"><Avatar user={v.viewer} size={30}/><span className="flex-1 text-sm">{v.viewer.displayName}</span><small className="text-[var(--muted)]">{timeAgo(v.viewedAt)}</small></div>):<p className="py-6 text-center text-sm text-[var(--muted)]">No views yet</p>}</div>:null}
  </div></div>;
}
