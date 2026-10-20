"use client";
import { useState } from "react";
export function AddQrContact({userId}:{userId:string}) {
  const [state,setState]=useState(""),[busy,setBusy]=useState(false);
  return <><button type="button" className="btn btn-primary min-h-11" disabled={busy||state==="Contact saved"} onClick={async()=>{setBusy(true);try{const response=await fetch("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})});if(!response.ok)throw new Error();setState("Contact saved");}catch{setState("Could not save contact. Please retry.");}finally{setBusy(false);}}}>{busy?"Saving…":state==="Contact saved"?state:"Add contact"}</button>{state&&state!=="Contact saved"?<p role="alert" className="mt-3 text-sm">{state}</p>:null}</>;
}
