import Link from "next/link";
import { redirect } from "next/navigation";
import { publicMetadata } from "@/lib/public-metadata";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  FileText,
  Headphones,
  Image as ImageIcon,
  LockKeyhole,
  MessageCircle,
  Mic,
  Phone,
  Users,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LogoWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = publicMetadata(
  "/",
  "Circlo — Private chat for you and your people",
  "Private messages, groups, voice notes and calls for the people close to you. Use Circlo in your browser today.",
);
export const dynamic = "force-dynamic";

const statusRows = [
  { label: "Chats, groups, voice notes and photos", state: "Available" },
  { label: "Audio calls while both people are online", state: "Available" },
  { label: "Phone and desktop browser", state: "Available" },
  { label: "Android app", state: "Available for testing" },
  { label: "iPhone app", state: "Planned" },
] as const;

const features = [
  { icon: LockKeyhole, title: "Private chats", text: "Only people in the chat can read its messages." },
  { icon: Users, title: "Groups", text: "Bring everyone into one conversation." },
  { icon: Mic, title: "Voice notes and photos", text: "Send a voice note, photo or file." },
  { icon: Headphones, title: "Audio calls", text: "Call a friend from your chat while you are both online." },
  { icon: CalendarClock, title: "Send it later", text: "Schedule a message for the right moment." },
  { icon: FileText, title: "Your data, your choice", text: "Export your account information or ask to delete it." },
];

const steps = [
  { title: "Sign up", text: "Create an account with your email and password." },
  { title: "Add a person", text: "Confirm your email, open New chat, and search for a person by name, username or phone." },
  { title: "Say hello", text: "Send your first message. Afterward, Save my chats helps you keep a file for a new phone." },
];

const questions = [
  { title: "Is Circlo free?", text: "Yes. You can use Circlo in your browser for free." },
  { title: "Are my private chats really private?", text: "Only approved devices in a chat can open its messages. Circlo still stores basic account information needed to run the service." },
  { title: "What if I change phones?", text: "Link your new phone from your old one to bring over chats it can open. A saved recovery file is another option; without either, older chats may be lost." },
  { title: "Can I use Circlo on a computer?", text: "Yes. Open Circlo in a browser on your phone, tablet or computer." },
];

function LandingChatPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-label="Example of the Circlo chat interface">
      <div className="absolute -inset-5 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--accent)_17%,transparent),transparent_70%)]" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.8rem] border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_30px_90px_-35px_rgba(0,0,0,.48)] sm:rounded-[2rem]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
          <LogoWordmark size={27} />
        </div>

        <div className="grid min-h-[390px] sm:grid-cols-[190px_1fr] md:min-h-[430px]">
          <aside className="hidden border-r border-[var(--border)] bg-[var(--bg)]/65 sm:block">
            <div className="flex items-center justify-between px-4 py-4"><h2 className="text-sm font-semibold">Chats</h2><MessageCircle className="h-4 w-4 text-[var(--accent-fg)]" /></div>
            <ul className="space-y-1 px-2 pb-3 text-left">
              <li className="rounded-xl bg-[var(--accent-soft)] px-3 py-2.5"><p className="truncate text-xs font-semibold">Weekend plans</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">Zara: Saturday still works?</p></li>
              <li className="rounded-xl px-3 py-2.5"><p className="truncate text-xs font-semibold">Maya Chen</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">Sent a voice note</p></li>
              <li className="rounded-xl px-3 py-2.5"><p className="truncate text-xs font-semibold">Book club</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">Omar: I found the next book</p></li>
            </ul>
          </aside>

          <section className="flex min-w-0 flex-col text-left" aria-label="Sample group chat">
            <header className="flex items-center gap-2.5 border-b border-[var(--border)] px-3 py-3 sm:px-4">
              <ChevronLeft className="h-4 w-4 text-[var(--muted)] sm:hidden" />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-fg)]">W</div>
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">Weekend plans</h2><p className="truncate text-[10px] text-[var(--muted)]">Zara, Maya, Omar and you</p></div>
              <Phone className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
              <LockKeyhole className="h-4 w-4 text-[var(--accent-fg)]" aria-label="Private chat" />
            </header>

            <div className="flex-1 space-y-3 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--accent-soft)_28%,transparent),transparent_72%)] px-3 py-4 sm:px-4 sm:py-5">
              <p className="mx-auto w-fit rounded-full border border-[var(--border)] bg-[var(--surface)]/90 px-3 py-1 text-[10px] text-[var(--muted)]">Only this group can read these messages</p>
              <div className="max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-sm"><p className="text-[10px] font-semibold text-[var(--accent-fg)]">Zara</p><p className="mt-1 text-xs leading-5">Saturday picnic, still on?</p><p className="mt-1 text-right text-[9px] text-[var(--muted)]">10:24</p></div>
              <div className="ml-auto max-w-[84%] rounded-2xl rounded-br-md bg-[var(--bubble-own-bg)] px-3 py-2.5 text-[var(--bubble-own-fg)] shadow-sm"><p className="text-xs leading-5">Yes! I’ll bring something to share.</p><p className="mt-1 flex items-center justify-end gap-1 text-[9px] text-[var(--bubble-own-sub)]">10:25 <Check className="h-3 w-3" /></p></div>
              <div className="max-w-[84%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-sm"><p className="text-[10px] font-semibold text-[var(--accent-fg)]">Omar</p><p className="mt-1 text-xs leading-5">I’ll bring the fruit 🍊</p><p className="mt-1 text-right text-[9px] text-[var(--muted)]">10:26</p></div>
              <div className="ml-auto flex max-w-[84%] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[10px] text-[var(--muted)]"><ImageIcon className="h-4 w-4 text-[var(--accent-fg)]" /> Picnic list · photo</div>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border)] px-3 py-3 sm:px-4"><span className="flex-1 rounded-full bg-[var(--input-bg)] px-4 py-2.5 text-xs text-[var(--muted)]">Write a message…</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--action)] text-[var(--action-fg)]"><MessageCircle className="h-4 w-4" /></span></div>
          </section>
        </div>
      </div>
      <div className="relative mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]"><LockKeyhole className="h-3.5 w-3.5 text-[var(--accent-fg)]" /> Only you and this group can read this chat</div>
    </div>
  );
}

export default async function LandingPage() {
  if (await getSessionUser()) redirect("/app");

  return (
    <main className="min-h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur-md">
        <nav aria-label="Main navigation" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-8">
          <Link href="/" aria-label="Circlo home"><LogoWordmark size={34} /></Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="#status" className="hidden min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--text)] sm:inline-flex">What works</Link>
            <Link href="#privacy" className="hidden min-h-11 items-center text-sm text-[var(--muted)] hover:text-[var(--text)] sm:inline-flex">Privacy</Link>
            <ThemeToggle />
            <Link href="/login" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold hover:text-[var(--accent-fg)]">Log in</Link>
          </div>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-10 sm:px-8 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:gap-12 lg:py-20">
        <div className="mx-auto w-full max-w-xl text-center lg:mx-0 lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)]"><span className="h-2 w-2 rounded-full bg-[var(--success)]" /> A little closer, a little quieter</span>
          <h1 className="font-display mt-6 text-[clamp(2.5rem,8vw,4.7rem)] font-semibold leading-[1.03] tracking-[-.055em]">Private chat for you and your people.</h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[var(--muted)] sm:text-lg lg:mx-0">Private messages, free to use. Chat in your browser today.</p>
          <div className="mx-auto mt-7 grid max-w-md gap-3 sm:grid-cols-2 lg:mx-0">
            <div>
              <Link href="/signup" className="btn btn-primary min-h-12 w-full justify-center px-5">Use in browser</Link>
              <p className="mt-2 text-xs text-[var(--muted)]">Create an account with email and password.</p>
            </div>
            <div>
              <Link href="/support" className="btn btn-secondary min-h-12 w-full justify-center">Get the Android app</Link>
              <p className="mt-2 text-xs text-[var(--muted)]">Contact us for Android testing access.</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-[var(--accent-fg)] underline underline-offset-4" href="/login">Log in</Link></p>
        </div>
        <LandingChatPreview />
      </section>

      <section id="status" aria-labelledby="status-title" className="scroll-mt-20 border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent-fg)]">Clear and simple</p>
          <h2 id="status-title" className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">What works today</h2>
          <ul className="mt-6 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-4 sm:px-6">
            {statusRows.map(({ label, state }) => <li key={label} className="flex min-h-14 items-center justify-between gap-4 py-3"><span className="text-sm leading-5 sm:text-base">{label}</span><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${state === "Available" ? "bg-[color-mix(in_srgb,var(--success)_13%,transparent)] text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--action)_16%,transparent)] text-[var(--action-fg)]"}`}>{state}</span></li>)}
          </ul>
        </div>
      </section>

      <section id="features" aria-labelledby="features-title" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-14 sm:px-8 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent-fg)]">Made for everyday conversations</p>
        <h2 id="features-title" className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">The little things that keep you close.</h2>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-fg)]"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p></article>)}
        </div>
      </section>

      <section aria-labelledby="steps-title" className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-16">
          <h2 id="steps-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Start in three steps</h2>
          <ol className="mt-7 grid gap-6 sm:grid-cols-3">
            {steps.map(({ title, text }, index) => <li key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-fg)]">{index + 1}</span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p></li>)}
          </ol>
        </div>
      </section>

      <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-20 mx-auto grid max-w-7xl gap-5 px-4 py-14 sm:px-8 sm:py-20 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent-fg)]">Your messages stay yours</p>
          <h2 id="privacy-title" className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">A clear promise about privacy.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Private chats use end-to-end encryption: AES-256-GCM protects content, and RSA-OAEP shares chat keys with approved devices.</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">To run the service, we store:</p>
          <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--muted)]">
            <li>Account details: display name, username, email address and a password hash, rather than your password.</li>
            <li>Optional profile details: the bio, avatar, phone number and links you add.</li>
            <li>Security details: sign-in times, IP address, browser and device type, and approximate country.</li>
            <li>Delivery details: chat membership, message times and sizes, and delivery and read status.</li>
          </ul>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]"><strong className="text-[var(--text)]">Open-source code and security audits:</strong> Circlo’s application code is currently private. We have not published an independent security review.</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]"><strong className="text-[var(--text)]">Photo location details:</strong> some uploads keep the original file, including location tags. Remove location information before sharing sensitive photos.</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]"><strong className="text-[var(--text)]">Advertising:</strong> we do not use your messages or shared photos for advertising algorithms or ad targeting.</p>
        </div>
        <Link href="/privacy" className="btn btn-secondary min-h-11 justify-center">Read the Privacy Policy</Link>
      </section>

      <section aria-labelledby="questions-title" className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-8 sm:py-16">
          <h2 id="questions-title" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">A few quick answers</h2>
          <div className="mt-5 divide-y divide-[var(--border)]">
            {questions.map(({ title, text }) => <details key={title} className="py-2"><summary className="flex min-h-12 cursor-pointer items-center py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{title}</summary><p className="max-w-3xl pb-3 text-sm leading-6 text-[var(--muted)]">{text}</p></details>)}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-8 sm:py-20">
        <LogoWordmark size={42} className="justify-center" />
        <h2 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Make room for your people.</h2>
        <p className="mt-3 text-sm text-[var(--muted)]">Start a private chat in your browser.</p>
        <Link href="/signup" className="btn btn-primary mt-6 min-h-12 justify-center px-6">Use in browser</Link>
      </section>

      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-6 sm:px-8">
          <LogoWordmark size={28} />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-3 text-xs text-[var(--muted)]"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/whatsapp-alternative">A WhatsApp alternative</Link><Link href="/support">Contact</Link></nav>
        </div>
      </footer>
    </main>
  );
}
