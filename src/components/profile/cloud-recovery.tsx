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
    if(!response.ok) throw new Error("Recovery status is unavailable. Your existing keys have not changed.");
    const data=await response.json();setBackups(data.backups);
  },[]);
  useEffect(()=>{ const controller=new AbortController(); void fetch("/api/e2ee/recovery-backups",{cache:"no-store",signal:controller.signal}).then(response=>{if(!response.ok)throw new Error("Recovery status is unavailable.");return response.json();}).then(data=>setBackups(data.backups)).catch(error=>{if(!controller.signal.aborted)setStatus(error.message);}); const update=()=>{void load().catch(()=>setStatus("Backup refresh needs attention. Retry when online."));}; window.addEventListener("circlo:recovery-status",update);return()=>{controller.abort();window.removeEventListener("circlo:recovery-status",update);}; },[load]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setStatus("");try{await action();}catch(cause){setStatus(cause instanceof Error?cause.message:"Recovery could not finish.");}finally{setBusy(false);}};
  const setup=async()=>{
    if(!user || !generated || code.trim().toLowerCase().replace(/\s+/g," ")!==generated) throw new Error("Enter all 24 words after saving them somewhere safe outside Circlo.");
    await encryption.waitForDeviceRegistration();
    const key=cloudRecoveryLocalKey(user.id,encryption.deviceId);
    // Preserve any established snapshot: recovery setup never silently rotates its secret.
    const previous=await readDeviceKeyMaterial(key);
    if(previous && JSON.parse(previous).code!==generated) throw new Error("A recovery code is already set up on this device. Refresh its saved copy instead.");
    if(!previous) await writeDeviceKeyMaterial(key,JSON.stringify({id:crypto.randomUUID(),code:generated,revision:0}));
    window.dispatchEvent(new Event("maddy:recovery-keys-changed"));
    await refreshCloudRecovery(user.id,encryption.deviceId);
    setCode("");setGenerated("");await load();setStatus("Chat recovery is set up. This device will refresh its protected copy when chat access changes.");
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
    <h3 className="font-semibold">Protect access to your chats</h3>
    <p className="mt-2 text-sm">{current?`Protected copy saved ${new Date(current.updatedAt).toLocaleString()}. Keep the recovery words or code you saved in a password manager.`:backups.length?"Protected copies exist for other devices. Set up a separate recovery phrase for this device.":"Not set up. Clearing saved browser data or losing every linked device can permanently remove access to old chats."}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">Your code protects this device&apos;s copy. Circlo cannot read the copy or reset a lost code. Email or Google sign-in cannot open old chats. This copy contains what a device needs to reopen chats, not messages, photos, files or calls.</p>
    {!current && !generated?<button type="button" disabled={busy||!encryption.initialized} className="btn btn-secondary mt-3" onClick={()=>{setGenerated(newRecoveryCode());setCode("");}}>Set up chat recovery</button>:null}
    {generated?<div className="mt-3 text-sm"><p>Write down all 24 words in order and keep them outside Circlo. Anyone with this phrase and the protected copy can open your saved chat access.</p><code className="mt-2 block select-all leading-7" aria-label="24-word recovery phrase">{generated}</code><label className="mt-3 block">Enter the 24 words again<input className="field-input mt-1 w-full" type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)}/></label><button disabled={busy||code.trim().toLowerCase().replace(/\s+/g," ")!==generated} type="button" className="btn btn-primary mt-3" onClick={()=>void run(setup)}>Save phrase and set up recovery</button></div>:null}
    {current?<button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={()=>void run(async()=>{if(user && await refreshCloudRecovery(user.id,encryption.deviceId)){await load();setStatus("Backup refreshed.");}else throw new Error("This device no longer has the backup code. Use your saved code to restore or create a separate recovery file.");})}>Refresh backup now</button>:null}
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Open chats with a saved code</summary>
      <p className="text-xs">Use the code you saved to open the protected copy. Without a saved code, recovery file or another device that can open the chats, Circlo cannot restore access. Another person may be able to share access to some chats, but this is not guaranteed.</p>
      <label className="mt-3 block text-sm">Choose a saved copy<select aria-label="Backup" className="field-input mt-1 w-full" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a saved copy</option>{backups.map(backup=><option key={backup.id} value={backup.id}>{new Date(backup.updatedAt).toLocaleString()} · {backup.deviceId.slice(0,8)}</option>)}</select></label>
      <label className="mt-3 block text-sm">Enter its recovery phrase or older recovery code<input type="password" autoComplete="off" className="field-input mt-1 w-full" value={code} onChange={event=>setCode(event.target.value)}/></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/>I saved a separate recovery file if this browser has chats I need. This will replace chat access saved here. Removed devices still need approval.</label>
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
        else {if(active)setWarning(false);}
      } catch {if(active)setWarning(true);}
      finally{running=false;if(again){again=false;queue();}}
    };
    const queue=()=>{if(timer) clearTimeout(timer);timer=setTimeout(()=>{void refresh();},Math.max(5000,60000-(Date.now()-last)));};
    queue();window.addEventListener("maddy:recovery-keys-changed",queue);window.addEventListener("online",queue);
    return()=>{active=false;if(timer)clearTimeout(timer);window.removeEventListener("maddy:recovery-keys-changed",queue);window.removeEventListener("online",queue);};
  },[userId,initialized,deviceId,waitForDeviceRegistration]);
  if(!warning||dismissed||!statusSlot) return null;
  return createPortal(<aside role="status" className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--accent-soft)] px-2 py-1 text-xs"><Link className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-[var(--surface-2)]" href="/app/settings#save-my-chats"><ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" /><span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--text)]">Save my chats</span><span className="block text-[var(--muted)]">A saved copy needs attention</span><span className="sr-only">This device&apos;s recovery needs attention.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" /></Link><button type="button" aria-label="Later" title="Remind me later" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={()=>setDismissed(true)}><X className="h-4 w-4" /></button></aside>,statusSlot);
}
