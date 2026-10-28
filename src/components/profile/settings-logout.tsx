"use client";
import {navigateWithReload} from "@/lib/navigation";
import {useState} from "react";
import {useAuth} from "@/components/providers/auth-provider";
export function SettingsLogout(){const {signOut}=useAuth();const [busy,setBusy]=useState(false);const [error,setError]=useState("");return <div><button type="button" className="btn btn-secondary min-h-11 w-full" disabled={busy} onClick={async()=>{setBusy(true);try{await signOut();navigateWithReload("/login");}catch{setError("Could not log out. Try again.");setBusy(false);}}}>{busy?"Logging out…":"Log out"}</button>{error?<p role="alert">{error}</p>:null}</div>;}
