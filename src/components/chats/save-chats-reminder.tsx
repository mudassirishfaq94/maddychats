"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {createPortal} from "react-dom";
import {useAuth} from "@/components/providers/auth-provider";
/** Offered after a confirmed send, never in front of the first conversation. */
export function SaveChatsReminder(){
 const {user,status,requestScope}=useAuth();const [shown,setShown]=useState<object|null>(null);const offered=useRef(new Set<string>());
 useEffect(()=>{if(!user||status!=="authenticated")return;const id=user.id;const handler=(event:Event)=>{if((event as CustomEvent).detail?.userId!==id||offered.current.has(id))return;const key=`circlo:save-chats-offered:${id}`;try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1");}catch{/* A storage failure must not interrupt sending. */}offered.current.add(id);setShown(requestScope);};window.addEventListener("circlo:message-sent",handler);return()=>window.removeEventListener("circlo:message-sent",handler);},[user,status,requestScope]);
 if(!user||status!=="authenticated"||shown!==requestScope)return null;
 const target=document.getElementById("recovery-status");if(!target)return null;
 return createPortal(<aside aria-label="Save my chats reminder" className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs"><span className="min-w-0 flex-1">Save a file on this phone so you can open old chats on a new phone.</span><Link href="/app/settings#save-my-chats" onClick={()=>setShown(null)} className="inline-flex min-h-11 items-center font-semibold underline">Save my chats</Link><button className="min-h-11 px-2" onClick={()=>setShown(null)}>Not now</button></aside>,target);
}
