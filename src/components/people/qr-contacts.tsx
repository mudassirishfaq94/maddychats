"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Camera, X } from "lucide-react";
import { contactCodeId } from "@/lib/contact-code";
type Detector = {detect(source:HTMLVideoElement):Promise<Array<{rawValue:string}>>};
type ScannerWindow = Window & {BarcodeDetector?:{new(options:{formats:string[]}):Detector;getSupportedFormats():Promise<string[]>}};

export function QrContacts() {
  const [open,setOpen]=useState(false),[scanning,setScanning]=useState(false),[value,setValue]=useState(""),[error,setError]=useState("");
  const video=useRef<HTMLVideoElement>(null);const router=useRouter();
  const navigate=(raw:string)=>{const id=contactCodeId(raw,location.origin);if(!id){setError("Use a valid Circlo contact link or contact ID.");return false;}setScanning(false);setOpen(false);router.push(`/contact/${id}`);return true;};
  useEffect(()=>{
    if(!scanning)return;let cancelled=false;let stream:MediaStream|null=null;let timer:ReturnType<typeof setTimeout>|undefined;
    const stop=()=>{stream?.getTracks().forEach(track=>track.stop());};
    void (async()=>{
      try {
        const Api=(window as ScannerWindow).BarcodeDetector;
        if(!Api||(await Api.getSupportedFormats()).includes("qr_code")===false)throw new Error("Camera scanning is unavailable here. Scan with your phone’s camera or paste the contact link below.");
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:640}},audio:false});
        if(cancelled){stop();return;}if(!video.current){stop();return;}video.current.srcObject=stream;await video.current.play();
        const detector=new Api({formats:["qr_code"]});
        const scan=async()=>{if(cancelled||!video.current)return;try{const codes=await detector.detect(video.current);if(cancelled)return;for(const code of codes){if(contactCodeId(code.rawValue,location.origin)){navigate(code.rawValue);return;}}}catch{/* A frame may not yet be ready. */}if(!cancelled)timer=setTimeout(()=>void scan(),300);};void scan();
      }catch(cause){if(!cancelled){setError(cause instanceof DOMException?"Camera access is unavailable. Allow camera access or paste a contact link.":cause instanceof Error?cause.message:"Could not start the camera.");setScanning(false);}stop();}
    })();
    return()=>{cancelled=true;clearTimeout(timer);stop();};
    // Navigation is only consumed by the active scanner; changes to manual input do not restart capture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[scanning]);
  return <div className="mt-3"><button type="button" className="btn btn-secondary min-h-11" onClick={()=>{setOpen(!open);setScanning(false);setError("");}}><QrCode className="h-4 w-4"/>Contact QR</button>{open?<section aria-label="Contact QR" className="mt-3 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Connect with your circle</h2><button type="button" aria-label="Close QR contacts" className="h-11 w-11" onClick={()=>{setOpen(false);setScanning(false);}}><X className="mx-auto h-4 w-4"/></button></div><Image unoptimized src="/api/contacts/qr" width={256} height={256} alt="Your unique Circlo contact QR code" className="mx-auto rounded-xl bg-white"/><p className="text-center text-xs text-[var(--muted)]">Share your code. It contains only your public contact link.</p>{scanning?<><video ref={video} muted playsInline className="aspect-square w-full rounded-xl bg-black object-cover"/><button type="button" className="btn btn-secondary" onClick={()=>setScanning(false)}>Stop camera</button></>:<button type="button" className="btn btn-secondary w-full min-h-11" onClick={()=>{setError("");setScanning(true);}}><Camera className="h-4 w-4"/>Scan a contact QR</button>}<label className="block text-sm">Contact link or ID<input aria-label="Contact link or ID" value={value} onChange={event=>setValue(event.target.value)} className="field-input mt-1" placeholder="https://circlo.chat/contact/…"/></label><button type="button" className="btn btn-primary min-h-11 w-full" disabled={!value.trim()} onClick={()=>navigate(value)}>Open contact</button>{error?<p role="alert" className="text-sm text-[var(--danger)]">{error}</p>:null}</section>:null}</div>;
}
