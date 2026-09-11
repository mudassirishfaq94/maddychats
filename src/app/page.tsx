import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type * as React from "react";
import { Clock3, Lock, MessageCircle } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Circlo — Your people, your conversations." };
export const dynamic = "force-dynamic";

const BENEFITS = [
  {
    icon: MessageCircle,
    title: "Close, even apart",
    text: "Messages, reactions and read receipts stay in step with the people who matter.",
  },
  {
    icon: Lock,
    title: "Private by nature",
    text: "Every message, voice note, and file is encrypted on your device before it is sent. Circlo cannot read your data.",
  },
  {
    icon: Clock3,
    title: "Made for your circle",
    text: "Open the app, find your people, and let the conversation take over.",
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--bg)]">
      <div aria-hidden="true" className="circlo-drift pointer-events-none absolute -right-28 top-16 h-80 w-80 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] blur-[1px]" />
      <div aria-hidden="true" className="circlo-drift pointer-events-none absolute -left-28 bottom-28 h-64 w-64 rounded-full bg-[color-mix(in_srgb,var(--action)_10%,transparent)] blur-2xl" style={{ animationDelay: "-3s" }} />
      <header className="relative z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_86%,transparent)] px-4 backdrop-blur-xl sm:px-6">
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
      <section className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="badge badge-accent animate-fade-up">
            Your people, your conversations
          </span>
          <h1
            className="font-display mt-5 text-[2.6rem] font-bold leading-[1.06] sm:text-[3.4rem] animate-fade-up"
            style={{ "--d": "80ms" } as React.CSSProperties}
          >
            Keep your
            <br />
            circle close.
          </h1>
          <p
            className="mt-4 max-w-sm text-base leading-relaxed text-[var(--muted)] animate-fade-up"
            style={{ "--d": "160ms" } as React.CSSProperties}
          >
            A calmer place for the conversations that make up your day.
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
          <div className="card-glass overflow-hidden rounded-[2rem] shadow-[0_28px_80px_-32px_color-mix(in_srgb,var(--action)_55%,transparent)]">
            <div className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--action)] text-[var(--action-fg)]">
                <LogoMark size={20} />
              </span>
              <span className="text-sm font-semibold">Circlo</span>
              <span className="flex items-center gap-1.5 text-xs text-[var(--accent-fg)]">
                <Lock className="h-3 w-3" />
                End-to-end encrypted
              </span>
            </div>
            <div className="space-y-3 bg-[var(--surface-2)] px-5 py-6">
              <div className="max-w-[70%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--bubble-other-bg)] px-3 py-2 text-sm">
                Are we still on for tonight?
              </div>
              <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-[var(--bubble-own-bg)] px-3 py-2 text-sm text-[var(--bubble-own-fg)]">
                Always. See you at seven ✦
              </div>
              <div className="ml-auto w-fit text-[0.65rem] text-[var(--bubble-own-sub)]">
                18:42 ✓✓
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
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
      <section className="relative z-10 border-y border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] backdrop-blur-sm">
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
      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-5 py-16 text-center">
        <h2 className="font-display text-3xl font-bold">Your next conversation is waiting.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Create your space and bring your circle together.
        </p>
        <Link href="/register" className="btn btn-primary mt-6">
          Create your account
        </Link>
      </section>

      <footer className="mt-auto border-t border-[var(--border)] py-5 text-center text-xs text-[var(--muted)]">
        Circlo — your people, your conversations.
        <span className="ml-2 opacity-70">App by Mudassir Ishfaq</span>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.65rem] opacity-60">
          <Lock className="h-2.5 w-2.5" />
          End-to-end encrypted with AES-256 + RSA-2048
        </div>
      </footer>
    </main>
  );
}
