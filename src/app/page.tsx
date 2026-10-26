import Link from "next/link";
import { redirect } from "next/navigation";
import { publicMetadata } from "@/lib/public-metadata";
import { ArrowDown, ArrowUpRight, CheckCheck, Fingerprint, KeyRound, LockKeyhole, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = publicMetadata("/", "Circlo — Private messaging with end-to-end encryption", "Privacy-first messaging for your circle. Discover encrypted chats, voice messages, groups, sharing and trusted-device controls on mobile and desktop.");
export const dynamic = "force-dynamic";
const benefits = [
  { icon: LockKeyhole, number: "01", title: "Private from the first hello.", text: "Chat messages are encrypted on your device before they leave it. Your conversation belongs with the people in it." },
  { icon: KeyRound, number: "02", title: "Your keys. Your control.", text: "Approve trusted devices and keep your recovery backup safe. Encryption stays part of the conversation, not an optional switch." },
  { icon: MessageCircle, number: "03", title: "Small moments. Closer circles.", text: "One-to-one chats, groups, reactions and read receipts. Everything you need to stay close, with space to just talk." },
];
const features = [
  { title: "Direct audio calls", text: "Call an accepted one-to-one chat while both of you have Circlo open. Audio travels directly between browsers; some mobile or restricted networks cannot connect without a relay." },
  { title: "Chats that feel personal", text: "Keep up one-to-one or bring your people together in group conversations. Invites and member controls help you manage your groups; read receipts and typing indicators keep conversations flowing." },
  { title: "Say it your way", text: "Send voice messages, photos and files in chat. Add a reaction, a GIF or an animated sticker when words are not quite enough." },
  { title: "Find the important things", text: "Search your chats, star or pin useful details, reply and forward. Edit or delete your own messages when you need to." },
  { title: "A little planning ahead", text: "Schedule a chat message for later, so a birthday wish or a thoughtful hello arrives at the right moment." },
  { title: "More than a conversation", text: "Share a status with your chosen audience and create communities to bring related conversations together." },
  { title: "Make your space yours", text: "Choose light or dark mode, personalize your profile and chat background, and control privacy, report concerns and block unwanted contact." },
  { title: "Security beyond sign-in", text: "Enable two-step verification, review signed-in sessions, approve encryption devices and save a recovery backup for your chat keys." },
  { title: "Updates on your terms", text: "Manage in-app notifications and opt into browser push where supported. Choose how you hear from your circle." },
  { title: "Control your account data", text: "Export your account data or request account deletion in settings. Understand what is kept and why in our Privacy Policy." },
];
const roadmap = [
  { title: "Video and broader calling support", text: "Video calls, background ringing and relay support for more networks remain planned work." },
  { title: "A stronger mobile experience", text: "Further Android and iOS app work, with better integration for everyday mobile use." },
  { title: "Simpler device recovery", text: "Clearer onboarding, device linking and recovery guidance while keeping encryption-key verification in place." },
  { title: "More transparency", text: "More accessible technical explanations of our encryption, and independent security review as resources allow." },
];
const questions = [
  { title: "What is Circlo?", text: "Circlo is a messaging web app for personal conversations, groups and communities. You can use it in your browser on mobile or desktop without installing an app." },
  { title: "What does end-to-end encryption mean here?", text: "Chat messages are encrypted on your device before sending and opened on approved participant devices. Keep your device keys and recovery backup safe. Public profile information and status posts are separate from private chat encryption." },
  { title: "Does encryption mean Circlo collects no data?", text: "No. Running the service still involves account details, device/session information and service metadata. Encryption protects chat content; our Privacy Policy explains the information handled separately." },
  { title: "What happens if I switch browsers or clear browser storage?", text: "Encryption keys belong to your account and browser storage. A new browser may need approval from a trusted device or secure recovery. Save a recovery backup before clearing browser data; email verification alone cannot recreate lost chat keys." },
  { title: "Can I make calls or download the planned mobile apps now?", text: "Direct one-to-one audio calls are available while both people keep Circlo open, subject to network compatibility. Video, background ringing and further native mobile app work remain on the roadmap without an announced release date." },
];
export default async function LandingPage() {
  if (await getSessionUser()) redirect("/app");
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--bg)]">
      <div className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[720px]" aria-hidden="true" />
      <header className="relative z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-md">
        <nav aria-label="Main navigation" className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-2 px-4 sm:px-10">
          <Link href="/" aria-label="Circlo home"><LogoWordmark size={38} /></Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="#features" className="hidden text-sm text-[var(--muted)] hover:text-[var(--text)] lg:block">Features</Link><Link href="#privacy" className="hidden text-sm text-[var(--muted)] hover:text-[var(--text)] md:block">Privacy</Link><Link href="#roadmap" className="hidden text-sm text-[var(--muted)] hover:text-[var(--text)] lg:block">What’s next</Link>
            <ThemeToggle />
            <Link href="/login" className="hidden text-sm font-semibold sm:block">Log in</Link>
            <Link href="/signup" className="btn btn-primary min-h-11! px-3! text-xs! sm:px-5! sm:text-sm!"><span className="sm:hidden">Join</span><span className="hidden sm:inline">Get started</span><ArrowUpRight className="hidden h-4 w-4 sm:block" /></Link>
          </div>
        </nav>
      </header>
      <section className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 pt-14 sm:px-10 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:gap-12 lg:pb-28">
        <div>
          <span className="badge badge-accent px-3! py-2! tracking-[.12em]! uppercase"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" /> A closer kind of connection</span>
          <h1 className="font-display mt-7 text-[clamp(2.8rem,6vw,5.2rem)] font-semibold leading-[1.07] tracking-[-.06em]">Your circle.<br />Your secrets.<br /><span className="text-[var(--accent-fg)]">Sealed.</span></h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[var(--muted)] sm:text-lg">A privacy-first messaging app for your everyday conversations. Bring your people together with end-to-end encrypted chats, voice messages, groups and thoughtful ways to share.</p>
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
      <section id="features" aria-labelledby="features-title" className="relative mx-auto max-w-7xl scroll-mt-6 px-5 py-16 sm:px-10 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-[var(--accent-fg)]">Available in Circlo today</p>
        <h2 id="features-title" className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">All the little ways to stay close.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">From a quick voice note to your group’s next big plan, your conversations have a home on mobile and desktop.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(({ title, text }, index) => <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><span aria-hidden="true" className="text-xs text-[var(--accent-fg)]">0{index + 1}</span><h3 className="font-display mt-4 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p></article>)}</div>
      </section>
      <section aria-labelledby="how-title" className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-10"><h2 id="how-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">A few steps. A closer circle.</h2><ol className="mt-8 grid gap-7 md:grid-cols-3">{[{title:"Make yourself at home",text:"Create an account with your email and password after reviewing our Terms and Privacy Policy. Google sign-in is optional, not required."},{title:"Keep your keys safe",text:"Set up this browser’s encryption device and save a recovery backup. Link another browser securely when you need it."},{title:"Start a conversation",text:"Find your people, send a chat request or create a group, and make the conversation your own."}].map(({title,text},index)=><li key={title}><span className="text-xs font-semibold text-[var(--accent-fg)]">STEP {index+1}</span><h3 className="mt-3 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p></li>)}</ol></div>
      </section>
      <section id="roadmap" aria-labelledby="roadmap-title" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-16 sm:px-10 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[.18em] text-[var(--accent-fg)]">Looking ahead</p><h2 id="roadmap-title" className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A circle with room to grow.</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">Our planned direction, separate from what you can use today. These features are not available yet; priorities may change and release dates have not been announced.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">{roadmap.map(({title,text})=><article key={title} className="rounded-2xl border border-dashed border-[var(--border-strong)] p-6"><span className="badge">Planned</span><h3 className="font-display mt-4 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p></article>)}</div>
      </section>
      <section id="questions" aria-labelledby="questions-title" className="border-y border-[var(--border)] bg-[var(--surface)]"><div className="mx-auto max-w-4xl px-5 py-16 sm:px-10"><h2 id="questions-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Clear answers before your first hello.</h2><div className="mt-8 divide-y divide-[var(--border)]">{questions.map(({title,text})=><details key={title} className="py-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{title}</summary><p className="pb-3 text-sm leading-7 text-[var(--muted)]">{text}</p></details>)}</div><div className="mt-6 flex flex-wrap gap-5 text-sm font-semibold text-[var(--accent-fg)]"><Link href="/privacy" className="underline">Read our Privacy Policy</Link><Link href="/terms" className="underline">Read our Terms and Conditions</Link></div></div></section>
      <section className="relative mx-auto max-w-7xl px-5 py-20 text-center sm:px-10"><LogoMark size={54} className="mx-auto" /><h2 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Make room for your people.</h2><p className="mt-3 text-sm text-[var(--muted)]">Your next hello belongs in your circle.</p><Link href="/signup" className="btn btn-primary mt-7">Join Circlo <ArrowUpRight className="h-4 w-4" /></Link></section>
      <footer className="border-t border-[var(--border)]"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-7 sm:px-10"><LogoWordmark size={28} /><p className="text-xs text-[var(--muted)]">Your circle. Your secrets. Sealed.</p><div className="flex flex-wrap gap-5 text-xs text-[var(--muted)]"><Link href="/whatsapp-alternative">A WhatsApp alternative</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div></footer>
    </main>
  );
}
