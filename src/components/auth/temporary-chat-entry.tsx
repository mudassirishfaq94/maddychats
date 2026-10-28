import Link from "next/link";
import { ArrowUpRight, KeyRound } from "lucide-react";
export function TemporaryChatEntry() {
  return <Link href="/temporary" className="mb-7 flex min-h-28 items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 transition-colors hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--bg)]"><KeyRound className="h-6 w-6" /></span>
    <span className="min-w-0 flex-1"><span className="block text-xs font-medium uppercase tracking-wider text-[var(--muted)]">No account needed</span><span className="mt-1 block text-lg font-semibold">Start a temporary chat</span><span className="mt-1 block text-sm leading-relaxed text-[var(--muted)]">A short chat with a code, not saved to your account.</span></span>
    <ArrowUpRight className="h-5 w-5 shrink-0" />
  </Link>;
}
