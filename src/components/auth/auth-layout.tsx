import Link from "next/link";
import type { ReactNode } from "react";
import type * as React from "react";
import { LogoWordmark, LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Clean split for the public auth pages: restrained brand panel on the left,
 * the form on the right. Monochrome, no decorative noise.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh bg-[var(--bg)] lg:grid-cols-[1fr_1fr]">
      {/* ------- brand panel ------- */}
      <section className="relative hidden flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] p-12 lg:flex">
        <Link href="/" aria-label="ZipTalk home" className="animate-fade-up">
          <LogoWordmark size={30} />
        </Link>

        <div className="max-w-md">
          <h2
            className="font-display text-[2.6rem] font-bold leading-[1.1] animate-fade-up"
            style={{ "--d": "100ms" } as React.CSSProperties}
          >
            Simple chat.
            <br />
            Real connections.
          </h2>
          <p
            className="mt-4 text-[1rem] leading-relaxed text-[var(--muted)] animate-fade-up"
            style={{ "--d": "180ms" } as React.CSSProperties}
          >
            Chat with people in real time — without unnecessary complexity.
          </p>

          <div
            className="mt-10 animate-fade-up"
            style={{ "--d": "260ms" } as React.CSSProperties}
            aria-hidden="true"
          >
            <div className="card-flat w-fit rotate-[-1deg] rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--muted)]">
                  <LogoMark size={17} />
                </span>
                <span className="text-sm font-semibold">ZipTalk</span>
                <span className="flex items-center gap-1 text-[0.68rem] text-[var(--accent-fg)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  Online
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="rounded-xl rounded-bl-sm border border-[var(--border)] bg-[var(--bubble-other-bg)] px-3 py-1.5 text-sm">
                  See you in a minute!
                </div>
                <div className="ml-auto rounded-xl rounded-br-sm bg-[var(--bubble-own-bg)] px-3 py-1.5 text-sm text-[var(--bubble-own-fg)]">
                  Already here.
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-[var(--muted)]">
          Real-time · Private · Simple
        </p>
      </section>

      {/* ------- form panel ------- */}
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:hidden" aria-label="ZipTalk home">
            <LogoWordmark size={26} />
          </Link>
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1
            className="font-display text-[1.9rem] font-bold leading-tight animate-fade-up"
            style={{ "--d": "60ms" } as React.CSSProperties}
          >
            {title}
          </h1>
          <p
            className="mt-2 text-[0.95rem] text-[var(--muted)] animate-fade-up"
            style={{ "--d": "120ms" } as React.CSSProperties}
          >
            {subtitle}
          </p>
          <div className="mt-8 animate-fade-up" style={{ "--d": "180ms" } as React.CSSProperties}>
            {children}
          </div>
          {footer ? (
            <div
              className="mt-8 text-center text-sm text-[var(--muted)] animate-fade-up"
              style={{ "--d": "240ms" } as React.CSSProperties}
            >
              {footer}
            </div>
          ) : null}
        </div>

        <p className="text-center text-xs text-[var(--muted)] opacity-70">
          App by Mudassir Ishfaq · Protected sign-in
        </p>
      </section>
    </main>
  );
}
