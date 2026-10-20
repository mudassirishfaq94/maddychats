"use client";
import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Avatar } from "@/components/avatar";
import type { SafeUser, StatusDTO, PublicUser } from "@/lib/types";

// StatusPage is ~20KB and only needed once the user actually lands on the
// status tab. Lazy-loading it keeps the initial bundle small.
let statusCode: Promise<typeof import("./status-page")> | undefined;
export function warmStatusCode() { return statusCode ??= import("./status-page").catch(cause => { statusCode = undefined; throw cause; }); }
const StatusPage = dynamic(() => warmStatusCode().then(module => module.StatusPage), { ssr: false });
type Preview={owner:PublicUser;expiresAt:string};
// Only lightweight identities in memory. No media, status text, persistent cache or clickable stale stories.
const previews=new Map<string,Preview[]>();
export function StatusEntry({me}:{me:SafeUser}) {
  const [items,setItems]=useState<StatusDTO[]|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  const [cached]=useState(()=>(previews.get(me.id)??[]).filter(item=>Date.parse(item.expiresAt)>Date.now()));
  useEffect(()=>{void warmStatusCode().catch(()=>undefined);const controller=new AbortController();void fetch("/api/status",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Could not refresh statuses.");const data=await response.json();if(!Array.isArray(data.statuses))throw new Error("Could not refresh statuses.");setItems(data.statuses);previews.clear();previews.set(me.id,data.statuses.map((item:StatusDTO)=>({owner:item.owner,expiresAt:item.expiresAt})));}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Could not refresh statuses.");});return()=>controller.abort();},[me.id,attempt]);
  if(items)return <Suspense fallback={<div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6"><h1 className="font-display text-3xl font-bold">Status</h1><p role="status" className="mt-2 text-sm text-[var(--muted)]">Loading updates</p><div aria-busy="true" className="mt-6 space-y-3">{[0,1,2].map(id=><div key={id} className="h-20 animate-pulse rounded-2xl bg-[var(--surface-2)] motion-reduce:animate-none"/>)}</div></div>}><StatusPage me={me} initial={items}/></Suspense>;
  const unique=[...new Map(cached.map(item=>[item.owner.id,item])).values()];
  return <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6"><h1 className="font-display text-3xl font-bold">Status</h1><p role="status" className="mt-2 text-sm text-[var(--muted)]">Refreshing updates…</p><div aria-busy={!error} className="mt-6 space-y-3">{unique.length?unique.map(item=><div key={item.owner.id} className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-3 opacity-60"><Avatar user={item.owner} size={48}/><span className="text-sm">{item.owner.displayName}</span></div>):[0,1,2].map(id=><div key={id} className="h-20 animate-pulse rounded-2xl bg-[var(--surface-2)] motion-reduce:animate-none"/>)}</div>{error?<div role="alert" className="mt-4 text-sm">{error}<button type="button" className="btn btn-secondary ml-3 min-h-11" onClick={()=>{setError("");setAttempt(value=>value+1);}}>Retry</button></div>:null}</div>;
}
