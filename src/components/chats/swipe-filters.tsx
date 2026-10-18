"use client";
import { useRef, type ReactNode } from "react";

export function SwipeFilters({children}:{children:ReactNode}) {
  const drag=useRef<{x:number;scroll:number;active:boolean}|null>(null);
  return <div className="chat-filters mt-3 flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onPointerDown={event=>{if(event.pointerType==="mouse"&&event.button===0)drag.current={x:event.clientX,scroll:event.currentTarget.scrollLeft,active:false};}} onPointerMove={event=>{const state=drag.current;if(!state)return;const distance=event.clientX-state.x;if(Math.abs(distance)>7) {state.active=true;event.currentTarget.setPointerCapture(event.pointerId);}if(state.active){event.currentTarget.scrollLeft=state.scroll-distance;event.preventDefault();}}} onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onClickCapture={event=>{if(drag.current?.active){event.preventDefault();event.stopPropagation();}drag.current=null;}}>{children}</div>;
}
