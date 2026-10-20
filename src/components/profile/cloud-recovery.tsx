"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck, ChevronRight, X } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { useSharedE2EE } from "@/components/providers/e2ee-provider";
import { cloudRecoveryLocalKey, newRecoveryCode, openRecovery, refreshCloudRecovery } from "@/lib/cloud-key-recovery";
import { recoveryBundleKey, validateRecoveryBundle } from "@/lib/device-recovery-file";
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
    if(!user || !generated || code.trim()!==generated) throw new Error("Enter the complete recovery code after saving it outside Circlo.");
    await encryption.waitForDeviceRegistration();
    const key=cloudRecoveryLocalKey(user.id,encryption.deviceId);
    // Preserve any established snapshot: recovery setup never silently rotates its secret.
    const previous=localStorage.getItem(key);
    if(previous && JSON.parse(previous).code!==generated) throw new Error("Recovery is already configured on this device. Refresh its backup instead.");
    if(!previous) localStorage.setItem(key,JSON.stringify({id:crypto.randomUUID(),code:generated,revision:0}));
    window.dispatchEvent(new Event("maddy:recovery-keys-changed"));
    await refreshCloudRecovery(user.id,encryption.deviceId);
    setCode("");setGenerated("");await load();setStatus("Encrypted recovery is configured. This device will refresh its backup automatically when chat keys change.");
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
    if(!keys.some((key:{deviceId:string;publicKey:string})=>key.deviceId===bundle.deviceId && key.publicKey===publicKey)) throw new Error("This identity is no longer registered. Restore through a trusted device; no keys were replaced.");
    // Single active-identity write; quotas leave the existing identity untouched.
    localStorage.setItem(cloudRecoveryLocalKey(user.id,bundle.deviceId),JSON.stringify({id:backup.id,code:code.trim(),revision:backup.revision}));
    localStorage.setItem(recoveryBundleKey(user.id),JSON.stringify(bundle));
    setCode("");window.location.reload();
  };
  const current=backups.find(backup=>backup.deviceId===encryption.deviceId && backup.confirmed);
  return <section id="cloud-recovery" className="mt-4 rounded-xl border border-[var(--border)] p-4">
    <h3 className="font-semibold">Encrypted chat recovery</h3>
    <p className="mt-2 text-sm">{current?`Backup saved ${new Date(current.updatedAt).toLocaleString()}. Keep your recovery code in your password manager.`:backups.length?"Recovery backups exist for other devices. This device is not yet protected by its own recovery code.":"Not configured. Clearing browser data or losing all linked devices can permanently remove access to your chat history."}</p>
    <p className="mt-2 text-xs text-[var(--muted)]">Your separate recovery code encrypts the backup on this device. Circlo cannot read it or reset a lost code. Google login and email verification cannot decrypt old chats. Backups contain encryption identities and saved chat keys, not messages, media or Signal sessions.</p>
    {!current && !generated?<button type="button" disabled={busy||!encryption.initialized} className="btn btn-secondary mt-3" onClick={()=>{setGenerated(newRecoveryCode());setCode("");}}>Set up recovery code</button>:null}
    {generated?<div className="mt-3 text-sm"><p>Save this code outside Circlo before continuing. Anyone with this code and your encrypted backup can restore its keys.</p><code className="mt-2 block select-all break-all" aria-label="New recovery code">{generated}</code><label className="mt-3 block">Re-enter the saved code<input className="field-input mt-1 w-full" type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)}/></label><button disabled={busy||code.trim()!==generated} type="button" className="btn btn-primary mt-3" onClick={()=>void run(setup)}>Confirm code and save encrypted backup</button></div>:null}
    {current?<button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={()=>void run(async()=>{if(user && await refreshCloudRecovery(user.id,encryption.deviceId)){await load();setStatus("Backup refreshed.");}else throw new Error("This device no longer has the backup code. Use your saved code to restore or create a separate recovery file.");})}>Refresh backup now</button>:null}
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-medium">Restore using a saved recovery code</summary>
      <p className="text-xs">Restore the original identity using its saved code. Circlo cannot recover your original identity without a saved code, recovery file or device that still holds it. A trusted participant may be able to restore individual chat keys; this is not guaranteed.</p>
      <label className="mt-3 block text-sm">Backup<select aria-label="Backup" className="field-input mt-1 w-full" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a backup</option>{backups.map(backup=><option key={backup.id} value={backup.id}>{new Date(backup.updatedAt).toLocaleString()} · {backup.deviceId.slice(0,8)}</option>)}</select></label>
      <label className="mt-3 block text-sm">Saved recovery code<input type="password" autoComplete="off" className="field-input mt-1 w-full" value={code} onChange={event=>setCode(event.target.value)}/></label>
      <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/>I have preserved any keys needed from this browser. Restore will replace its active identity; revoked identities still require approval.</label>
      <button type="button" disabled={busy||!selected||!code||!replace} className="btn btn-primary mt-3" onClick={()=>void run(restore)}>Restore encrypted keys</button>
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
        const local=localStorage.getItem(cloudRecoveryLocalKey(userId,deviceId));
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
  return createPortal(<aside role="status" className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--accent-soft)] px-2 py-1 text-xs"><Link className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-[var(--surface-2)]" href="/app/profile#cloud-recovery"><ShieldCheck className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" /><span className="min-w-0 flex-1"><span className="block font-semibold text-[var(--text)]">Protect your chat history</span><span className="block text-[var(--muted)]">Set up secure recovery</span><span className="sr-only">This device&apos;s recovery needs attention.</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--accent-fg)]" /></Link><button type="button" aria-label="Later" title="Remind me later" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]" onClick={()=>setDismissed(true)}><X className="h-4 w-4" /></button></aside>,statusSlot);
}
