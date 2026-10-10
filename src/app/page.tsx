import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowDown, ArrowUpRight, CheckCheck, Fingerprint, KeyRound, LockKeyhole, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Circlo — Your circle. Your secrets. Sealed." };
export const dynamic = "force-dynamic";
const benefits = [
  { icon: LockKeyhole, number: "01", title: "Private from the first hello.", text: "Chat messages are encrypted on your device before they leave it. Your conversation belongs with the people in it." },
  { icon: KeyRound, number: "02", title: "Your keys. Your control.", text: "Approve trusted devices and keep your recovery backup safe. Encryption stays part of the conversation, not an optional switch." },
  { icon: MessageCircle, number: "03", title: "Small moments. Closer circles.", text: "One-to-one chats, groups, reactions and read receipts. Everything you need to stay close, with space to just talk." },
];
export default async function LandingPage() {
  if (await getSessionUser()) redirect("/app");
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--bg)]">
      <div className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden="true" />
      <header className="relative z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-md">
        <nav aria-label="Main navigation" className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-10">
          <Link href="/" aria-label="Circlo home"><LogoWordmark size={38} /></Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="#privacy" className="hidden text-sm text-[var(--muted)] hover:text-[var(--text)] md:block">Built for privacy</Link>
            <ThemeToggle />
            <Link href="/login" className="hidden text-sm font-semibold sm:block">Log in</Link>
            <Link href="/signup" className="btn btn-primary">Join your circle <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </nav>
      </header>
      <section className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-14 sm:px-10 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-28">
        <div>
          <span className="badge badge-accent px-3! py-2! tracking-[.12em]! uppercase"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> A closer kind of connection</span>
          <h1 className="font-display mt-7 text-[clamp(2.8rem,6vw,5.2rem)] font-semibold leading-[1.07] tracking-[-.06em]">Your circle.<br />Your secrets.<br /><span className="text-[var(--accent-fg)]">Sealed.</span></h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[var(--muted)] sm:text-lg">Less noise. More you. A private place for your people, with end-to-end encrypted conversations from the first hello.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary min-h-12! px-6!">Find your circle <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/login" className="btn btn-secondary min-h-12! px-6!">Log in</Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck className="h-4 w-4 text-[var(--accent-fg)]" /> Encrypted messages. Thoughtful connections.</p>
          <Link href="#privacy" className="mt-10 inline-flex items-center gap-2 text-xs text-[var(--muted)]"><ArrowDown className="h-3.5 w-3.5" /> Meet your quieter corner of the internet</Link>
        </div>
        <div className="relative mx-auto w-full max-w-[460px]" aria-hidden="true">
          <div className="brand-orbit absolute -inset-5 sm:-inset-9" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_30px_90px_-35px_rgba(0,0,0,.5)]">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-5">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)]"><LogoMark size={30} /></span><div><span className="block text-sm font-semibold">The inner circle</span><span className="text-xs text-[var(--muted)]">Just you and your people</span></div></div>
              <LockKeyhole className="h-5 w-5 text-[var(--accent-fg)]" />
            </div>
            <div className="space-y-5 px-5 py-7">
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--muted)]"><LockKeyhole className="h-3 w-3" /> End-to-end encrypted</div>
              <div className="flex items-end gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] text-[var(--accent-fg)]">A</span><div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-4 py-3 text-sm">Same place. Same people?<span className="mt-2 block text-[10px] text-[var(--muted)]">18:41</span></div></div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--bubble-own-bg)] px-4 py-3 text-sm text-[var(--bubble-own-fg)]">Always. Some things are just ours.<span className="mt-2 flex items-center justify-end gap-1 text-[10px] text-[var(--bubble-own-sub)]">18:42 <CheckCheck className="h-3 w-3" /></span></div>
              <div className="flex items-end gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] text-[var(--accent-fg)]">A</span><div className="rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-4 py-3 text-sm">That’s our circle.<span className="mt-2 block text-[10px] text-[var(--muted)]">18:42</span></div></div>
            </div>
            <div className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-4"><span className="flex-1 rounded-full bg-[var(--input-bg)] px-4 py-3 text-xs text-[var(--muted)]">A little hello…</span><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--action)] text-[var(--action-fg)]"><Send className="h-4 w-4" /></span></div>
          </div>
          <div className="relative mx-auto mt-6 flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]"><Fingerprint className="h-4 w-4 text-[var(--accent-fg)]" /> Personal by design. Private by default.</div>
        </div>
      </section>
      <section id="privacy" className="relative scroll-mt-6 border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-10">
          <p className="text-xs font-medium uppercase tracking-[.18em] text-[var(--accent-fg)]">A little more peace of mind</p>
          <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Connection without the noise.</h2>
          <div className="mt-10 grid gap-9 md:grid-cols-3">{benefits.map(({icon:Icon,number,title,text})=><article key={number} className="border-t border-[var(--border)] pt-6"><div className="flex items-center justify-between"><Icon className="h-6 w-6 text-[var(--accent-fg)]" /><span className="text-xs text-[var(--muted)]">{number}</span></div><h3 className="font-display mt-5 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p></article>)}</div>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-5 py-4"><p className="max-w-2xl text-xs leading-5 text-[var(--muted)]">Privacy deserves clear answers. Encryption protects message content; account and service metadata are handled separately.</p><Link href="/privacy" className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-[var(--accent-fg)]">Read our privacy policy <ArrowUpRight className="h-4 w-4" /></Link></div>
        </div>
      </section>
      <section className="relative mx-auto max-w-7xl px-5 py-20 text-center sm:px-10"><LogoMark size={54} className="mx-auto" /><h2 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Make room for your people.</h2><p className="mt-3 text-sm text-[var(--muted)]">Your next hello belongs in your circle.</p><Link href="/signup" className="btn btn-primary mt-7">Join Circlo <ArrowUpRight className="h-4 w-4" /></Link></section>
      <footer className="border-t border-[var(--border)]"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7 sm:px-10"><LogoWordmark size={28} /><p className="text-xs text-[var(--muted)]">Your circle. Your secrets. Sealed.</p><div className="flex gap-5 text-xs text-[var(--muted)]"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div></footer>
    </main>
  );
}
