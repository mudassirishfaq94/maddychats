"use client";
import { Clock, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { useRealtime } from "@/components/providers/realtime-provider";
type Scheduled = { id:string; text:string; scheduledFor:string; encrypted:boolean; replyToMessageId:string|null };
export function ScheduledMessageManager({conversationId}:{conversationId:string}) {
 const {decrypt,encrypt,prepareConversation,waitForDeviceRegistration}=useSharedE2EE();const {subscribe}=useRealtime();
 const [loadedAt,setLoadedAt]=useState(()=>Date.now());
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Scheduled[]>([]),[edit,setEdit]=useState<Scheduled|null>(null);
 const [text,setText]=useState(""),[time,setTime]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  const response=await fetch(`/api/conversations/${conversationId}/scheduled`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error("Scheduled messages could not be loaded.");
  const data=await response.json();setRows(data.scheduled);setLoadedAt(Date.now());
 },[conversationId]);
 useEffect(()=>{if(!open)return;let active=true;const refresh=()=>{void load().catch(cause=>{if(active)setError(cause.message);});};refresh();const remove=subscribe(event=>{if((event.type==="scheduled:changed"||event.type==="message:new")&&event.conversationId===conversationId)refresh();});const timer=setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{active=false;clearInterval(timer);remove();window.removeEventListener("focus",refresh);};},[open,load,subscribe,conversationId]);
 async function change(row:Scheduled,method:"DELETE"|"PATCH") {
  setBusy(true);setError("");
  try {
   if(method==="PATCH"){await waitForDeviceRegistration();const prepared=await prepareConversation(conversationId);if(!prepared.ready)throw new Error("Secure delivery is not ready. Your scheduled message was preserved.");}
   const body=method==="DELETE"?{scheduledId:row.id}:{scheduledId:row.id,text:await encrypt(text,conversationId),scheduledFor:new Date(time).toISOString(),encrypted:true,replyToMessageId:row.replyToMessageId};
   const response=await fetch(`/api/conversations/${conversationId}/scheduled`,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const data=await response.json();if(!response.ok)throw new Error(data.error??"The scheduled message changed. Refresh and retry.");
   setEdit(null);setText("");await load();
  }catch(cause){setError(cause instanceof Error?cause.message:"Scheduled change failed.");}finally{setBusy(false);}
 }
 async function beginEdit(row:Scheduled) {
  setBusy(true);setError("");try{setText(row.encrypted?await decrypt(row.text,conversationId):row.text);const date=new Date(row.scheduledFor);setTime(new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16));setEdit(row);}catch{setError("This device cannot decrypt that scheduled message. You can still cancel it.");}finally{setBusy(false);}
 }
 return <><button type="button" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--surface-2)]" onClick={()=>setOpen(true)}><Clock className="h-4 w-4 shrink-0 text-[var(--muted)]" /><span className="flex-1">Scheduled messages</span><ChevronRight className="h-4 w-4 text-[var(--muted)]" /></button>{open?<div role="dialog" aria-modal="true" aria-label="Manage scheduled messages" className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4"><section className="max-h-[85dvh] w-full max-w-md overflow-auto rounded-2xl bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Scheduled messages</h2><button className="btn min-h-11" disabled={busy} onClick={()=>{setOpen(false);setEdit(null);setText("");}}>Close</button></div><p className="mt-2 text-xs text-[var(--muted)]">Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sending is performed by the server; your device can be offline.</p>{rows.length?rows.map(row=><div key={row.id} className="mt-3 rounded-xl border border-[var(--border)] p-3"><p className="text-sm">{new Date(row.scheduledFor).toLocaleString()}</p>{Date.parse(row.scheduledFor)<loadedAt?<p className="mt-1 text-xs text-[var(--muted)]">Waiting for delivery. Permissions or server availability may be preventing sending; you can edit or cancel it.</p>:null}<div className="mt-2 flex gap-2"><button disabled={busy} className="btn min-h-11 text-xs" onClick={()=>void beginEdit(row)}>Edit message and time</button><button disabled={busy} className="btn min-h-11 text-xs" onClick={()=>void change(row,"DELETE")}>Cancel sending</button></div></div>):<p className="mt-3 text-sm">No messages waiting to send.</p>}{edit?<div className="mt-4 space-y-3"><label className="block text-sm">Message<textarea className="field-input mt-1 w-full" maxLength={2000} rows={3} value={text} onChange={event=>setText(event.target.value)}/></label><label className="block text-sm">New local date and time<input className="field-input mt-1 w-full" type="datetime-local" value={time} onChange={event=>setTime(event.target.value)}/></label><button disabled={busy||!text.trim()||!time} className="btn btn-primary min-h-11" onClick={()=>void change(edit,"PATCH")}>Save scheduled message</button></div>:null}{error?<p role="alert" className="mt-3 text-sm">{error}</p>:null}</section></div>:null}</>;
}
