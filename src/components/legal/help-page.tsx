import Link from "next/link";
import type { ReactNode } from "react";
import { LogoWordmark } from "@/components/brand/logo";

export function HelpPage({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-dvh bg-[var(--bg)] px-5 py-8 text-[var(--text)] sm:px-8">
    <div className="mx-auto w-full max-w-2xl">
      <Link href="/" aria-label="Circlo home"><LogoWordmark size={30} /></Link>
      <h1 className="mt-10 text-3xl font-bold tracking-tight">{title}</h1>
      <div className="mt-6 space-y-6 text-sm leading-7 [overflow-wrap:anywhere]">{children}</div>
      <nav aria-label="Help pages" className="mt-12 flex flex-wrap gap-x-5 gap-y-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--accent)]">
        <Link href="/">Home</Link><Link href="/support">Support</Link><Link href="/delete-account">Delete account</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link>
      </nav>
    </div>
  </main>;
}
