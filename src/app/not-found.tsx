import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Clock,
  Compass,
  FileText,
  Home,
  Link2Off,
  LockKeyhole,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SiteFooter, SiteHeader } from "@/components/site/page-shell";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist on Circlo. Head back to your circle.",
  robots: { index: false, follow: false },
};

const LINKS = [
  {
    icon: Home,
    title: "Home",
    text: "Start from the front door.",
    href: "/",
  },
  {
    icon: MessagesSquare,
    title: "Your chats",
    text: "Open your conversations, groups and statuses.",
    href: "/app/chats",
  },
  {
    icon: ShieldCheck,
    title: "Privacy policy",
    text: "What we collect, and what encryption keeps from us.",
    href: "/privacy",
  },
  {
    icon: FileText,
    title: "Terms of service",
    text: "The ground rules for using Circlo.",
    href: "/terms",
  },
];

/**
 * Custom 404 for the whole site.
 *
 * Covers both an unmatched URL and the `notFound()` calls inside the app: an
 * unknown `/invite/<code>`, and the admin area hiding itself from signed-out
 * visitors. The session is read only to pick the right primary action, and the
 * lookup is already cached by the root layout for this request.
 */
export default async function NotFound() {
  const user = await getSessionUser();

  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <SiteHeader />

      <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div>
          <span className="badge badge-accent px-3! py-2! uppercase tracking-[.12em]!">
            <Link2Off className="h-3.5 w-3.5" /> Error 404
          </span>
          <h1 className="font-display mt-6 text-[clamp(2.4rem,6vw,4.4rem)] font-semibold leading-[1.06] tracking-[-.05em]">
            This circle is empty.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[var(--muted)]">
            We could not find that page. It may have been renamed, moved, or the link that brought you here may have
            expired — invitation links and status updates are time-limited by design.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <>
                <Link href="/app/chats" className="btn btn-primary min-h-12! px-6!">
                  Back to your chats <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/" className="btn btn-secondary min-h-12! px-6!">
                  Go to the homepage
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="btn btn-primary min-h-12! px-6!">
                  Log in <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/" className="btn btn-secondary min-h-12! px-6!">
                  Go to the homepage
                </Link>
              </>
            )}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-[var(--muted)]">
            <LockKeyhole className="h-4 w-4 text-[var(--accent-fg)]" />
            Nothing was deleted. Your conversations and keys are untouched.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[420px]" aria-hidden="true">
          <div className="brand-orbit absolute -inset-5 sm:-inset-9" />
          <div className="card-glass relative overflow-hidden rounded-[2rem] px-6 py-10 text-center">
            <LogoMark size={44} className="mx-auto" />
            <p className="font-display mt-6 text-[clamp(4rem,12vw,6.5rem)] font-semibold leading-none tracking-[-.06em] text-[var(--accent-fg)]">
              404
            </p>
            <p className="mt-3 text-sm text-[var(--muted)]">No such page in this circle.</p>
            <div className="mt-7 flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-[11px] text-[var(--muted)]">
              <LockKeyhole className="h-3.5 w-3.5" /> End-to-end encrypted
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
            <Compass className="h-5 w-5 text-[var(--accent-fg)]" /> Where to next
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LINKS.map(({ icon: Icon, title, text, href }) => (
              <Link
                key={href}
                href={href}
                className="card-flat group flex flex-col rounded-2xl p-5 transition-colors hover:border-[var(--border-strong)]"
              >
                <span className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-[var(--accent-fg)]" />
                  <ArrowUpRight className="h-4 w-4 text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-4 text-sm font-semibold text-[var(--text)]">{title}</span>
                <span className="mt-1.5 text-[13px] leading-6 text-[var(--muted)]">{text}</span>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-start gap-4 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)] px-5 py-4">
            <Clock className="h-5 w-5 shrink-0 text-[var(--accent-fg)]" />
            <p className="max-w-2xl text-[13px] leading-6 text-[var(--text)]">
              <strong>Following an invitation?</strong> Invite links expire, and they can only be used a limited number
              of times, so the one you were sent may no longer be valid. Ask the group owner for a fresh link — your
              account and your existing conversations are unaffected.
            </p>
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]">
            <ScrollText className="h-4 w-4 text-[var(--accent-fg)]" />
            If a link inside Circlo sent you here, tell us through the support options in your profile so we can fix it.
          </p>
        </div>
      </section>

      <SiteFooter label="Page not found" meta="Error 404" />
    </main>
  );
}
