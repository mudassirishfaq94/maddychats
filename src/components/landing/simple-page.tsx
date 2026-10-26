import Link from "next/link";
import { ArrowRight, Check, ChevronDown, LockKeyhole, Users, Mic, Phone, CalendarClock, Database, ShieldCheck, Smartphone } from "lucide-react";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";

const statuses = [
 ["Chats, groups, voice notes, photos", "Available"],
 ["Audio calls (both people online)", "Available"],
 ["Works in phone and desktop browsers", "Available"],
 ["Android app on Google Play", "Coming soon"],
 ["Video calls and iPhone app", "Planned"],
];
const features = [
 { icon: LockKeyhole, title:"Encrypted chats", text:"Only you and your people can read them." },
 { icon: Users, title:"Groups", text:"Bring everyone into one chat." },
 { icon: Mic, title:"Voice and photos", text:"Send a voice note, photo or file." },
 { icon: Phone, title:"Audio calls", text:"Call a friend right from the chat." },
 { icon: CalendarClock, title:"Schedule a message", text:"Send a birthday wish at the right time." },
 { icon: Database, title:"Your data, your choice", text:"Export your data or delete your account." },
];
const steps = [
 ["Sign up","Create an account and find your people."],
 ["Save your recovery key","Keep a recovery backup before switching phones."],
 ["Say hello","Start a private chat or make a group."],
];
const faqs = [
 ["Is it free?","Yes. Circlo is free to use in your browser."],
 ["Is it really private?","Private messages are end-to-end encrypted. We still store basic account information to run the service."],
 ["What if I change my phone?","Save a recovery backup first. You may also need to approve your new phone."],
 ["Can I use it on desktop?","Yes. Open Circlo in a desktop or phone browser."],
];
const primary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#74543A] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#5C402C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#74543A]";
const shell = "mx-auto max-w-6xl px-5 sm:px-8";
const kicker = "text-xs font-bold uppercase tracking-[.18em] text-[#806043]";
const headline = "mt-3 text-3xl font-bold tracking-[-.04em] sm:text-4xl";

export function SimpleLanding() {
 return <main className="min-h-dvh bg-[#F8F7F4] text-[#242329] [--brand-mark:#242329] [font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
  <header className="sticky top-0 z-30 border-b border-[#E9E6DF] bg-[#F8F7F4]/95 backdrop-blur-xl">
   <nav className={shell+" flex min-h-[76px] items-center justify-between gap-3 pt-[env(safe-area-inset-top)]"} aria-label="Main navigation">
    <Link href="/" aria-label="Circlo home"><LogoWordmark size={32}/></Link>
    <div className="flex items-center gap-4 text-xs font-semibold sm:gap-8 sm:text-sm">
     <Link href="#status" className="hover:underline">What works</Link><Link href="#privacy" className="hover:underline">Privacy</Link><Link href="/login" className="text-[#74543A] hover:underline">Log in</Link>
    </div>
   </nav>
  </header>
  <section className="relative overflow-hidden">
   <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full bg-[#E6D9C6]/60 blur-[95px]"/>
   <div className={shell+" relative grid items-center gap-8 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:pb-24"}>
    <div>
     <span className="inline-flex items-center gap-2 rounded-full border border-[#E7DCD0] bg-white px-4 py-2 text-xs font-semibold text-[#74543A]"><ShieldCheck size={15}/> Private by design</span>
     <h1 className="mt-7 max-w-[640px] text-[clamp(3rem,6vw,5.2rem)] font-bold leading-[1.04] tracking-[-.06em]">Private chat for <span className="text-[#806043]">you and your people.</span></h1>
     <p className="mt-6 max-w-lg text-base leading-7 text-[#5F6067] sm:text-lg">End-to-end encrypted. Free. Works in your browser today, Android app coming soon.</p>
     <div className="mt-9 grid gap-3 sm:max-w-[505px] sm:grid-cols-2">
      <div><Link href="/signup" className={primary}>Use in browser <ArrowRight size={18}/></Link><p className="mt-2 text-center text-xs text-[#767178]">Sign up in under a minute</p></div>
      <div><div aria-disabled="true" className="flex min-h-12 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-[#DED6CB] bg-white px-6 py-3 text-sm font-bold text-[#7E7A77]"><Smartphone size={17}/> Android app</div><p className="mt-2 text-center text-xs text-[#767178]">Coming soon to Google Play</p></div>
     </div>
     <p className="mt-7 text-sm text-[#65636A]">Already have an account? <Link href="/login" className="font-bold text-[#74543A] underline underline-offset-4">Log in</Link></p>
    </div>
    <div className="relative mx-auto w-full max-w-[380px]">
     <div aria-hidden="true" className="absolute inset-x-10 top-20 bottom-12 rounded-full bg-[#C5AE90]/40 blur-[65px]"/>
     <img src="/brand/circlo-demo-phone.svg" width="440" height="762" loading="lazy" decoding="async" alt="Circlo phone screen preview with fictional names and sample messages" className="relative mx-auto block h-auto w-full max-w-[360px] drop-shadow-[0_30px_48px_rgba(38,31,28,.17)]"/>
     <div className="relative mx-auto -mt-2 flex w-fit items-center gap-2 rounded-full border border-[#E9E3DA] bg-white px-4 py-2 text-xs font-semibold text-[#5E554B] shadow-sm"><LockKeyhole size={14}/> Only you two can read this</div>
    </div>
   </div>
  </section>
  <section id="status" aria-labelledby="status-title" className="scroll-mt-24 border-y border-[#E9E6DF] bg-white py-16 sm:py-20"><div className="mx-auto max-w-5xl px-5 sm:px-8">
   <p className={kicker}>Simple and clear</p><h2 id="status-title" className={headline}>What works today</h2>
   <div className="mt-8 overflow-hidden rounded-[18px] border border-[#E9E6DF] bg-[#FCFBF9]">{statuses.map(([label,state])=><div key={label} className="flex min-h-[70px] items-center justify-between gap-4 border-b border-[#ECE9E3] px-4 py-4 last:border-0 sm:px-7"><span className="text-sm font-medium sm:text-base">{label}</span><span className={"shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold sm:text-xs "+(state==="Available"?"bg-[#E7F4EC] text-[#246847]":"bg-[#FBF0DC] text-[#926018]")}>{state==="Available"&&<Check className="mr-1 inline h-3 w-3"/>}{state}</span></div>)}</div>
  </div></section>
  <section id="features" aria-labelledby="features-title" className={shell+" py-20 sm:py-24"}><p className={kicker}>Everything you need</p><h2 id="features-title" className={headline}>Stay close. Keep it private.</h2>
   <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(({icon:Icon,title,text})=><article key={title} className="rounded-[18px] border border-[#E9E5DF] bg-white p-6 shadow-[0_10px_30px_-27px_rgba(38,31,28,.3)]"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2EBE1] text-[#74543A]"><Icon size={23}/></div><h3 className="mt-6 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#6B6A70]">{text}</p></article>)}</div>
  </section>
  <section className="bg-[#EEEAE4] py-16 sm:py-20"><div className={shell}><p className={kicker}>Easy to get started</p><h2 className={headline}>Start in 3 steps</h2>
   <div className="mt-9 grid gap-4 md:grid-cols-3">{steps.map(([title,text],i)=><article key={title} className="rounded-[18px] border border-[#E6DFD5] bg-white p-6"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#74543A] text-sm font-bold text-white">{i+1}</span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#6B6A70]">{text}</p></article>)}</div>
  </div></section>
  <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-24 px-5 py-20 sm:px-8"><div className="mx-auto grid max-w-6xl gap-6 rounded-[26px] bg-[#22272A] px-7 py-11 text-white sm:px-12 md:grid-cols-[auto_1fr] md:items-center md:gap-9"><div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-white/10 text-[#E8C79C]"><ShieldCheck size={32}/></div><div><h2 id="privacy-title" className="text-3xl font-bold tracking-[-.04em]">Your messages stay yours.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#D1D5D4] sm:text-base">Your private chats are end-to-end encrypted. We still store basic account information to run Circlo.</p><Link href="/privacy" className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-[#E8C79C] underline underline-offset-4">Read our privacy policy <ArrowRight size={16}/></Link></div></div></section>
  <section aria-labelledby="faq-title" className="mx-auto max-w-4xl px-5 pb-20 sm:px-8 sm:pb-24"><p className={kicker}>Good to know</p><h2 id="faq-title" className={headline}>Quick answers</h2><div className="mt-8 divide-y divide-[#E2DDD6] border-y border-[#E2DDD6]">{faqs.map(([title,text])=><details key={title} className="group py-1"><summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">{title}<ChevronDown size={20} className="shrink-0 text-[#806043] transition-transform group-open:rotate-180"/></summary><p className="max-w-2xl pb-5 text-sm leading-6 text-[#69686E]">{text}</p></details>)}</div></section>
  <section className="border-t border-[#E9E6DF] bg-white px-5 py-16 text-center sm:px-8"><LogoMark size={48} className="mx-auto"/><h2 className="mt-5 text-3xl font-bold tracking-[-.04em] sm:text-4xl">Make room for your people.</h2><p className="mt-3 text-sm text-[#6B6A70]">A little closer. A lot more private.</p><Link href="/signup" className={primary+" mx-auto mt-7 max-w-[240px]"}>Use in browser <ArrowRight size={16}/></Link></section>
  <footer className="border-t border-[#E9E6DF] bg-white px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-7 sm:px-8"><div className={shell+" flex flex-wrap items-center justify-between gap-5 px-0 sm:px-0"}><LogoWordmark size={27}/><p className="text-xs text-[#7A7476]">Your circle. Your secrets. Sealed.</p><div className="flex flex-wrap gap-5 text-xs font-medium text-[#655F60]"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/whatsapp-alternative">A WhatsApp alternative</Link><Link href="/support">Contact</Link></div></div></footer>
 </main>;
}
