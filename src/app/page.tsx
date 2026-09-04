import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type * as React from "react";
import { Clock3, Lock, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "ZipTalk — Simple chat. Real connections.",
};
export const dynamic = "force-dynamic";

const BENEFITS = [
  {
    icon: MessageCircle,
    title: "Real-time",
    text: "Messages, reactions and read receipts arrive instantly — no refresh, no waiting.",
  },
  {
    icon: Lock,
    title: "End-to-end encrypted",
    text: "Every message, voice note, and file is encrypted on your device before it is sent. Maddy Chats cannot read your data — only you and the people you chat with hold the keys.",
  },
  {
    icon: Clock3,
    title: "Simple",
    text: "Nothing to learn. Open the app, pick someone, and start typing.",
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6">
        <LogoWordmark size={26} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost hidden! sm:inline-flex!">
            Log in
          </Link>
          <Link href="/register" className="btn btn-primary">
            Get started
          </Link>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="badge badge-accent animate-fade-up">
            Real-time messaging
          </span>
          <h1
            className="font-display mt-5 text-[2.6rem] font-bold leading-[1.06] sm:text-[3.4rem] animate-fade-up"
            style={{ "--d": "80ms" } as React.CSSProperties}
          >
            Simple chat.
            <br />
            Real connections.
          </h1>
          <p
            className="mt-4 max-w-sm text-base leading-relaxed text-[var(--muted)] animate-fade-up"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            Chat with people in real time — without unnecessary complexity.
          </p>
          <div
            className="mt-8 flex flex-wrap items-center gap-3 animate-fade-up"
            style={{ "--d": "240ms" } as React.CSSProperties}
          >
            <Link href="/register" className="btn btn-primary">
              Get started
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Log in
            </Link>
          </div>
        </div>

        {/* ---------- minimal product preview ---------- */}
        <div
          className="animate-fade-up"
          style={{ "--d": "300ms" } as React.CSSProperties}
          aria-hidden="true"
        >
          <div className="card-flat overflow-hidden rounded-2xl">
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                <LogoMark size={20} />
              </span>
              <span className="text-sm font-semibold">ZipTalk</span>
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-fg)]">
                <Lock className="h-3 w-3" />
                End-to-end encrypted
              </span>
            </div>
            <div className="space-y-2 bg-[var(--bg)] px-4 py-5">
              <div className="max-w-[70%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-3 py-2 text-sm">
                Still on for tonight?
              </div>
              <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-[var(--bubble-own-bg)] px-3 py-2 text-sm text-[var(--bubble-own-fg)]">
                Of course. See you at 7.
              </div>
              <div className="ml-auto w-fit text-[0.65rem] text-[var(--bubble-own-sub)]">
                18:42 ✓✓
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <span className="flex-1 rounded-full bg-[var(--input-bg)] px-4 py-2 text-sm text-[var(--muted)]">
                Message…
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--action)] text-[var(--action-fg)]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M3 20.5 21 12 3 3.5l3 7.4L14 12l-8 1.1-3 7.4Z" fill="currentColor" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- benefits ---------- */}
      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-12 sm:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-fg)]">
                <Icon className="h-4 w-4" />
              </span>
              <h3 className="mt-3 text-sm font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 py-14 text-center">
        <h2 className="font-display text-2xl font-bold">Ready when you are.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          It takes less than a minute to start your first conversation.
        </p>
        <Link href="/register" className="btn btn-primary mt-6">
          Create your account
        </Link>
      </section>

      <footer className="mt-auto border-t border-[var(--border)] py-5 text-center text-xs text-[var(--muted)]">
        ZipTalk — simple chat, real connections.
        <span className="ml-2 opacity-70">App by Mudassir Ishfaq</span>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.65rem] opacity-60">
          <Lock className="h-2.5 w-2.5" />
          End-to-end encrypted with AES-256 + RSA-2048
        </div>
      </footer>
    </main>
  );
}
