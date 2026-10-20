import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { LogoMark, LogoWordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared chrome for the public legal pages (privacy policy, terms of service).
 *
 * Both pages are plain server components, so nothing here may hold state or
 * hooks: the pieces below are presentational only and the theme picker stays a
 * client component at the leaf.
 */

export function LegalHeader() {
  return (
    <header className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-md">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-20 max-w-6xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-8"
      >
        <Link href="/" aria-label="Circlo home" className="shrink-0">
          <LogoWordmark size={38} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none sm:gap-5">
          <ThemeToggle />
          <Link href="/login" className="hidden text-sm font-semibold sm:block">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary px-3! text-xs! sm:text-sm!">
            Join your circle <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function LegalHero({
  badge,
  badgeIcon: BadgeIcon,
  title,
  lead,
  meta,
}: {
  badge: string;
  badgeIcon: LucideIcon;
  title: string;
  lead: string;
  meta: { icon: LucideIcon; text: string }[];
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 sm:px-8 sm:pt-16">
      <span className="badge badge-accent px-3! py-2! uppercase tracking-[.12em]!">
        <BadgeIcon className="h-3.5 w-3.5" /> {badge}
      </span>
      <h1 className="font-display mt-6 max-w-3xl text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.08] tracking-[-.045em]">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-[var(--muted)]">{lead}</p>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
        {meta.map(({ icon: Icon, text }) => (
          <span key={text} className="inline-flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--accent-fg)]" /> {text}
          </span>
        ))}
      </div>
    </section>
  );
}

export function LegalHighlights({ items }: { items: { icon: LucideIcon; text: string }[] }) {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="card-glass mt-10 grid gap-5 rounded-3xl p-6 sm:grid-cols-3 sm:p-7">
        {items.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-fg)]">
              <Icon className="h-5 w-5" />
            </span>
            <p className="text-sm leading-6 text-[var(--text)]">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegalIndex({ entries, heading = "Contents" }: { entries: { id: string; label: string }[]; heading?: string }) {
  return (
    <aside aria-label="Jump to a section" className="lg:sticky lg:top-8 lg:self-start">
      <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--accent-fg)]">{heading}</p>
      <ol className="mt-4 space-y-1.5 text-sm">
        {entries.map((entry, position) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--text)]"
            >
              <span className="w-4 shrink-0 pt-0.5 text-[11px] tabular-nums opacity-70">{position + 1}</span>
              <span className="min-w-0">{entry.label}</span>
              <ChevronRight className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/**
 * The body grid: a sticky index beside the sections. `minmax(0, 1fr)` keeps a
 * wide child (the provider table) from stretching the column past the viewport
 * on small screens.
 */
export function LegalBody({ index, children }: { index: ReactNode; children: ReactNode }) {
  return (
    <div className="border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        {index}
        <div className="min-w-0 space-y-12">{children}</div>
      </div>
    </div>
  );
}

export function LegalSection({
  id,
  number,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  number: string;
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--border)] pt-10">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-fg)]">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <span className="block text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--accent-fg)]">
            Section {number}
          </span>
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        </div>
      </div>
      <div className="mt-5 space-y-4 text-sm leading-7 text-[var(--muted)]">{children}</div>
    </section>
  );
}

export function LegalChecklist({ items, tone = "good" }: { items: string[]; tone?: "good" | "note" }) {
  const bullet = tone === "good" ? "bg-[var(--success)]" : "bg-[var(--accent)]";
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className={`mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full ${bullet}`} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A definition-style block: a bolded lead-in followed by the explanation. */
export function LegalPoints({ points }: { points: { lead: string; text: string }[] }) {
  return (
    <ul className="space-y-3">
      {points.map((point) => (
        <li key={point.lead}>
          <strong className="text-[var(--text)]">{point.lead}</strong> {point.text}
        </li>
      ))}
    </ul>
  );
}

export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[var(--accent-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--text)]">
      {children}
    </p>
  );
}

export function LegalClosing({
  title,
  text,
  links,
}: {
  title: string;
  text: string;
  links: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-6">
        <div className="flex items-center gap-4">
          <LogoMark size={36} />
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{text}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={link.primary ? "btn btn-primary" : "btn btn-secondary"}
            >
              {link.label} {link.primary ? <ArrowUpRight className="h-4 w-4" /> : null}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LegalFooter({ label, lastUpdated }: { label: string; lastUpdated: string }) {
  return (
    <footer className="border-t border-[var(--border)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-7 sm:px-8">
        <LogoWordmark size={28} />
        <p className="text-xs text-[var(--muted)]">
          {label} · Last updated {lastUpdated}
        </p>
        <div className="flex flex-wrap gap-5 text-xs text-[var(--muted)]">
          <Link href="/">Home</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
          <Link href="/delete-account">Delete account</Link>
        </div>
      </div>
    </footer>
  );
}
