"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, ChevronRight, Send } from "lucide-react";
import { circloGuides, findCircloGuides, type HelpGuide } from "@/lib/circlo-help";

const questions: Record<string,string> = {
  scheduled:"How do I schedule a message?", temporary:"How do I start a temporary chat?",
  notifications:"Why am I not getting notifications?", calls:"Why is my call not connecting?",
  recovery:"How do I recover my encrypted history?", groups:"How do group permissions work?",
  communities:"Where can I find my communities?", invites:"How do I share a group invitation?",
  contacts:"How do I add a contact?", disappearing:"How do disappearing messages work?",
  privacy:"Who can see when I am online?", delivery:"What do the message ticks mean?",
  media:"How do I send photos and voice messages?", account:"How can I secure my account?",
};
type Turn={id:number;question:string;guide?:HelpGuide};

export function CircloHelp() {
  const [query,setQuery]=useState(""),[turns,setTurns]=useState<Turn[]>([]),[pending,setPending]=useState<Turn|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),sequence=useRef(0),log=useRef<HTMLDivElement>(null);
  const suggestions=useMemo(()=>query.trim()?findCircloGuides(query):circloGuides.filter(guide=>["contacts","media","recovery","notifications"].includes(guide.id)),[query]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight,behavior:"auto"});},[turns,pending]);
  const ask=(question:string,guide?:HelpGuide)=>{
    if(timer.current||!question.trim())return;
    const turn={id:++sequence.current,question:question.trim().slice(0,500),guide:guide??findCircloGuides(question)[0]};
    setPending(turn);setQuery("");
    timer.current=setTimeout(()=>{timer.current=null;setTurns(current=>[...current,turn].slice(-20));setPending(null);},1400);
  };
  const chip="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50";
  const answer=(turn:Turn)=><article aria-label="Help answer" className="max-w-[95%] rounded-2xl rounded-tl-sm border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-relaxed sm:max-w-[85%]">
    {turn.guide?<><h2 className="font-semibold">{turn.guide.title}</h2><ol className="mt-3 list-decimal space-y-2 pl-5">{turn.guide.steps.map(step=><li key={step}>{step}</li>)}</ol>{turn.guide.note?<p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">{turn.guide.note}</p>:null}<Link href={turn.guide.href} className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-[var(--accent-fg)]">{turn.guide.linkLabel}<ChevronRight className="h-4 w-4"/></Link></>:<><p>I don’t have a verified guide for that question yet. Try one of the suggested questions below.</p><Link href="/support" className="mt-3 inline-flex min-h-11 items-center font-medium text-[var(--accent-fg)]">Contact support<ChevronRight className="ml-1 h-4 w-4"/></Link></>}
  </article>;
  return <main className="mx-auto flex h-[100dvh] min-h-0 max-w-3xl flex-col bg-[var(--surface)] text-[var(--text)]">
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-4 sm:px-6"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-fg)]"><Bot className="h-6 w-6"/></span><div className="min-w-0 flex-1"><h1 className="text-lg font-semibold">Circlo Help</h1><p className="text-xs text-[var(--muted)]">Your guide to Circlo</p></div><Link href="/app/settings" className={chip}>Settings</Link></header>
    <div ref={log} role="log" aria-label="Conversation with Circlo Help" aria-live="polite" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-[var(--surface-2)] p-4 text-sm leading-relaxed"><p className="font-semibold">Hi! What would you like help with?</p><p className="mt-2">Ask about Circlo or choose a question below. Your questions stay on this page. Please keep passwords and recovery codes private.</p></div>
      {turns.map(turn=><section key={turn.id} className="space-y-3"><p className="ml-auto w-fit max-w-[90%] break-words rounded-2xl rounded-tr-sm bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-fg)]">{turn.question}</p>{answer(turn)}</section>)}
      {pending?<section className="space-y-3"><p className="ml-auto w-fit max-w-[90%] break-words rounded-2xl rounded-tr-sm bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-fg)]">{pending.question}</p><div role="status" aria-label="Circlo Help is typing" className="flex w-fit items-center gap-2 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--muted)]"><span aria-hidden="true" className="flex gap-1">{[0,1,2].map(index=><span key={index} style={{animationDelay:`${index*150}ms`}} className="h-1.5 w-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"/>)}</span><span>Circlo Help is typing…</span></div></section>:null}
    </div>
    <footer className="shrink-0 border-t border-[var(--border)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div aria-label="Suggested questions" className="mb-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto">{suggestions.map(guide=><button key={guide.id} type="button" disabled={Boolean(pending)} onClick={()=>ask(questions[guide.id]??guide.title,guide)} className={chip}>{questions[guide.id]??guide.title}</button>)}</div>
      <form className="flex items-center gap-2" onSubmit={event=>{event.preventDefault();ask(query);}}><label className="min-w-0 flex-1"><span className="sr-only">Ask Circlo Help</span><input type="text" maxLength={500} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ask a question…" className="field-input min-h-12 w-full"/></label><button aria-label="Ask question" disabled={Boolean(pending)||!query.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-fg)] disabled:opacity-40"><Send className="h-5 w-5"/></button></form>
    </footer>
  </main>;
}
