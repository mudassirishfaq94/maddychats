"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, ChevronRight, X } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { cloudRecoveryLocalKey, newRecoveryCode, openRecovery, refreshCloudRecovery } from "@/lib/cloud-key-recovery";
import { recoveryBundleKey, validateRecoveryBundle, writeRecoveryIdentity } from "@/lib/device-recovery-file";
import { readDeviceKeyMaterial, writeDeviceKeyMaterial } from "@/lib/device-key-storage";
type Backup = { id:string; deviceId:string; confirmed:boolean; updatedAt:string; revision:number };

export function CloudRecoverySettings() {
  const { user } = useAuth(); const encryption = useSharedE2EE();
  const [backups,setBackups]=useState<Backup[]>([]), [generated,setGenerated]=useState(""), [code,setCode]=useState("");
  const [selected,setSelected]=useState(""), [busy,setBusy]=useState(false), [status,setStatus]=useState(""), [replace,setReplace]=useState(false);
  const load=useCallback(async()=>{
    const response=await fetch("/api/e2ee/recovery-backups",{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error("We couldn't check your saved chat key. Your chats have not changed. Try again when you're online.");
    const data=await response.json();setBackups(data.backups);
  },[]);
  useEffect(()=>{ const controller=new AbortController(); void fetch("/api/e2ee/recovery-backups",{cache:"no-store",signal:controller.signal}).then(response=>{if(!response.ok)throw new Error("We couldn't check your saved chat key. Try again when you're online.");return response.json();}).then(data=>setBackups(data.backups)).catch(error=>{if(!controller.signal.aborted)setStatus(error.message);}); const update=()=>{void load().catch(()=>setStatus("Backup refresh needs attention. Retry when online."));}; window.addEventListener("circlo:recovery-status",update);return()=>{controller.abort();window.removeEventListener("circlo:recovery-status",update);}; },[load]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setStatus("");try{await action();}catch(cause){setStatus(cause instanceof Error?cause.message:"Recovery could not finish.");}finally{setBusy(false);}};
  const setup=async()=>{
    if(!user || !generated || code.trim().toLowerCase().replace(/\s+/g," ")!==generated) throw new Error("Enter all 24 recovery words in order. Keep a copy on paper or in a password manager.");
    await encryption.waitForDeviceRegistration();
    const key=cloudRecoveryLocalKey(user.id,encryption.deviceId);
    // Preserve any established snapshot: recovery setup never silently rotates its secret.
    const previous=await readDeviceKeyMaterial(key);
    if(previous && JSON.parse(previous).code!==generated) throw new Error("This device already has recovery words. Update its saved chat key instead.");
    if(!previous) await writeDeviceKeyMaterial(key,JSON.stringify({id:crypto.randomUUID(),code:generated,revision:0}));
    window.dispatchEvent(new Event("maddy:recovery-keys-changed"));
    await refreshCloudRecovery(user.id,encryption.deviceId);
    setCode("");setGenerated("");await load();setStatus("Your spare chat key is saved. Circlo will keep this device's copy up to date. Keep your recovery words safe.");
  };
  const restore=async()=>{
    if(!user || !selected || !replace) return;
    const response=await fetch(`/api/e2ee/recovery-backups?id=${encodeURIComponent(selected)}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error("Recovery backup is unavailable.");
    const {backup}=await response.json();
    const bundle=await openRecovery(backup.envelope,code,{id:backup.id,userId:user.id,deviceId:backup.deviceId});
    const publicKey=await validateRecoveryBundle(bundle,user.id);
    const keysResponse=await fetch("/api/e2ee/keys",{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!keysResponse.ok) throw new Error("Sign in again before restoring.");
    const {keys}=await keysResponse.json();
    if(!keys.some((key:{deviceId:string;publicKey:string})=>key.deviceId===bundle.deviceId && key.publicKey===publicKey)) throw new Error("This backup can't be restored here any more. Nothing was changed.");
    // Save the identity together before publishing the wrapped history keys.
    await writeDeviceKeyMaterial(cloudRecoveryLocalKey(user.id,bundle.deviceId),JSON.stringify({id:backup.id,code:code.trim(),revision:backup.revision}));
    await writeRecoveryIdentity(bundle);
    localStorage.setItem(recoveryBundleKey(user.id),JSON.stringify({...bundle,keypair:"",secret:""}));
    setCode("");window.location.reload();
  };
  const current=backups.find(backup=>backup.deviceId===encryption.deviceId && backup.confirmed);
  return <section id="cloud-recovery" className="mt-4 rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold">Save a spare chat key online</h3>
    <p className="mt-2 text-sm">Circlo can keep a locked copy of your chat key. Your recovery words unlock it if you change phones or lose this device.</p>
    <p className="mt-2 text-sm">{current?`Saved ${new Date(current.updatedAt).toLocaleString()}. Keep your recovery words or code on paper or in a password manager.`:backups.length?"Your other devices have saved chat keys. You can save one for this device too.":"This is optional. Set it up while you can still open your chats."}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">This saves a way to open chats, not copies of messages, photos or calls. Circlo cannot replace lost recovery words, and signing in by email alone cannot open older chats.</p>
    {!current && !generated?<button type="button" disabled={busy||!encryption.initialized} className="btn btn-secondary mt-3" onClick={()=>{setGenerated(newRecoveryCode());setCode("");}}>Set up chat recovery</button>:null}
    {generated?<div className="mt-3 text-sm"><p>Write down these 24 recovery words in order. Keep them on paper or in a password manager, outside Circlo. Anyone with the words and saved copy could open your chats.</p><code className="mt-2 block select-all leading-7" aria-label="Recovery words">{generated}</code><label className="mt-3 block">Enter your saved recovery words to check them<input className="field-input mt-1 w-full" type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)}/></label><button disabled={busy||code.trim().toLowerCase().replace(/\s+/g," ")!==generated} type="button" className="btn btn-primary mt-3" onClick={()=>void run(setup)}>I saved the words · Finish setup</button></div>:null}
    {current?<button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={()=>void run(async()=>{if(user && await refreshCloudRecovery(user.id,encryption.deviceId)){await load();setStatus("Your saved chat key is up to date.");}else throw new Error("The recovery words are no longer saved on this device. Use the copy you kept, or save a recovery file from a device that can open your chats.");})}>Update saved chat key</button>:null}
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Use saved recovery words or a code</summary>
      <p className="text-xs">Choose your saved chat key, then enter the words or code you kept. If you lost them, try linking a device that can still open your chats.</p>
      <p className="mt-2 text-xs text-[var(--muted)]">Without a working linked device, recovery file, or saved words or code, some older chats may be lost.</p>
      <label className="mt-3 block text-sm">Choose a saved copy<select aria-label="Backup" className="field-input mt-1 w-full" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a saved copy</option>{backups.map(backup=><option key={backup.id} value={backup.id}>{new Date(backup.updatedAt).toLocaleString()} · {backup.deviceId.slice(0,8)}</option>)}</select></label>
      <label className="mt-3 block text-sm">Your saved recovery words or code<input type="password" autoComplete="off" className="field-input mt-1 w-full" value={code} onChange={event=>setCode(event.target.value)}/></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/>I saved a spare key for chats already on this device. This replaces its chat key; a device that was removed still needs approval.</label>
      <button type="button" disabled={busy||!selected||!code||!replace} className="btn btn-primary mt-3" onClick={()=>void run(restore)}>Open chats on this device</button>
    </details>
    {status?<p role="status" className="mt-3 text-sm">{status}</p>:null}
  </section>;
}

/** Refresh only after explicit recovery-code setup; no crypto on the send/typing path. */
export function CloudRecoverySync() {
  const pathname=usePathname();
  const [statusSlot,setStatusSlot]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    // The route's shell commits its slot before the next paint.
    const frame=requestAnimationFrame(()=>setStatusSlot(document.getElementById("recovery-status")));
    return()=>cancelAnimationFrame(frame);
  },[pathname]);
  const {user}=useAuth(); const userId=user?.id; const {initialized,deviceId,waitForDeviceRegistration}=useSharedE2EE();
  const [warning,setWarning]=useState(false),[dismissed,setDismissed]=useState(false);
  useEffect(()=>{
    if(!userId || !initialized) return;
    let active=true,running=false,again=false;let timer:ReturnType<typeof setTimeout>|undefined;let last=0;
    const refresh=async()=>{
      if(!active) return;
      if(running) {again=true;return;}
      running=true;last=Date.now();
      try {
        await waitForDeviceRegistration();
        if(!active) return;
        const local=await readDeviceKeyMaterial(cloudRecoveryLocalKey(userId,deviceId));
        if(local) {await refreshCloudRecovery(userId,deviceId); if(active)setWarning(false);}
        else {if(active)setWarning(true);}
      } catch {if(active)setWarning(true);}
      finally{running=false;if(again){again=false;queue();}}
    };
    const queue=()=>{if(timer) clearTimeout(timer);timer=setTimeout(()=>{void refresh();},Math.max(5000,60000-(Date.now()-last)));};
    queue();window.addEventListener("maddy:recovery-keys-changed",queue);window.addEventListener("online",queue);
    return()=>{active=false;if(timer)clearTimeout(timer);window.removeEventListener("maddy:recovery-keys-changed",queue);window.removeEventListener("online",queue);};
  },[userId,initialized,deviceId,waitForDeviceRegistration]);
  if(!warning||dismissed||!statusSlot) return null;
  return createPortal(<aside role="status" className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--accent-soft)] px-2 py-1 text-xs"><Link className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-[var(--surface-2)]" href="/app/profile#cloud-recovery"><ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" /><span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--text)]">Keep a way back into your chats</span><span className="block text-[var(--muted)]">Save a spare chat key · optional</span><span className="sr-only">You can save a spare chat key in Profile.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" /></Link><button type="button" aria-label="Later" title="Remind me later" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={()=>setDismissed(true)}><X className="h-4 w-4" /></button></aside>,statusSlot);
}
