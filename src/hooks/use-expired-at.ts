"use client";
import {useCallback,useSyncExternalStore} from "react";
/** A deadline is an external clock store: no render-time clock mutations or polling. */
export function useExpiredAt(value?:string|null) {
  const deadline=value?Date.parse(value):Infinity;
  const snapshot=useCallback(()=>Number.isFinite(deadline)&&Date.now()>=deadline,[deadline]);
  const subscribe=useCallback((changed:()=>void)=>{
    if(!Number.isFinite(deadline))return()=>{};
    let timer:ReturnType<typeof setTimeout>;
    const check=()=>{clearTimeout(timer);const remaining=deadline-Date.now();if(remaining>0)timer=setTimeout(check,Math.min(remaining,2147483647));else changed();};
    timer=setTimeout(check,Math.min(2147483647,Math.max(0,deadline-Date.now())));
    document.addEventListener("visibilitychange",check);
    return()=>{clearTimeout(timer);document.removeEventListener("visibilitychange",check);};
  },[deadline]);
  return useSyncExternalStore(subscribe,snapshot,()=>false);
}
