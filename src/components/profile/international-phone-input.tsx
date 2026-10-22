"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { ChevronDown } from "lucide-react";

/** One editable field handles country search, calling-code selection and number entry. */
export function InternationalPhoneInput({id,value,onChange,disabled}:{id:string;value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const root=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const listId=useId();
  const [open,setOpen]=useState(false),[active,setActive]=useState(0);
  const [search,setSearch]=useState("");
  const countries=useMemo(()=>{
    const names=new Intl.DisplayNames(["en"],{type:"region"});
    return getCountries().map(country=>({country,name:names.of(country)??country,code:"+"+getCountryCallingCode(country)})).sort((a,b)=>a.name.localeCompare(b.name));
  },[]);
  const matches=useMemo(()=>{
    const query=(open?search:value).trim().toLowerCase();
    return countries.filter(country=>!query || country.name.toLowerCase().includes(query) || country.country.toLowerCase()===query || country.code.startsWith(query));
  },[value,search,open,countries]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  const choose=(country:typeof countries[number])=>{
    const old=value;
    const parsed=parsePhoneNumberFromString(old);
    const national=parsed?.nationalNumber??(old.startsWith("+")?"":old.replace(/\D/g,"").replace(/^0+/,""));
    onChange(country.code+national);setOpen(false);input.current?.focus();
  };
  return <div ref={root} className="relative">
    <div className="flex min-h-12 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
      <input ref={input} id={id} type="text" role="combobox" autoComplete="tel" inputMode={open?"search":"tel"}
        style={{outline:"none"}}
        aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&matches[active]?`${listId}-${matches[active].country}`:undefined}
        placeholder={open?"Search country or +calling code":"+971 50 123 4567"} maxLength={64} value={open?search:value} disabled={disabled}
        className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-3 text-base disabled:opacity-50"
        onChange={event=>{const next=event.target.value;setActive(0);if(open||/[a-z]/i.test(next)){setSearch(next);setOpen(true);}else onChange(next);}}
        onKeyDown={event=>{
          if(event.key==="Escape"){setOpen(false);return;}
          if(event.key==="ArrowDown"){event.preventDefault();if(!open){setSearch("");setActive(0);setOpen(true);}else setActive(index=>Math.min(index+1,Math.max(0,matches.length-1)));}
          if(event.key==="ArrowUp"){event.preventDefault();setActive(index=>Math.max(0,index-1));}
          if(event.key==="Enter"&&open&&matches[active]){event.preventDefault();choose(matches[active]);}
          else if(event.key==="Enter"&&open&&/[a-z]/i.test(search))event.preventDefault();
        }}/>
      <button type="button" aria-label="Choose country calling code" aria-expanded={open} disabled={disabled} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--muted)]" onClick={()=>{if(!open){setSearch("");setActive(0);}setOpen(!open);input.current?.focus();}}><ChevronDown className="h-4 w-4"/></button>
    </div>
    {open?<ul id={listId} role="listbox" aria-label="Countries and calling codes" className="absolute inset-x-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
      {matches.map((country,index)=><li id={`${listId}-${country.country}`} key={country.country} role="option" aria-selected={index===active} className={index===active?"rounded-lg bg-[var(--surface-2)]":""}><button type="button" tabIndex={-1} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]" onPointerDown={event=>event.preventDefault()} onClick={()=>choose(country)}><span>{country.name}</span><span className="shrink-0 text-[var(--muted)]">{country.code}</span></button></li>)}
      {!matches.length?<li className="p-3 text-sm text-[var(--muted)]">Enter the full phone number including +country code.</li>:null}
    </ul>:null}
  </div>;
}
