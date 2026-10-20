import Link from "next/link";
import { LogoWordmark } from "@/components/brand/logo";

export default function NotFound() {
  return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
    <Link href="/" aria-label="Circlo home" className="w-fit"><LogoWordmark size={36} /></Link>
    <p className="mt-12 text-sm font-semibold tracking-widest text-[var(--accent-fg)]">404</p>
    <h1 className="font-display mt-3 text-3xl font-semibold sm:text-4xl">We couldn’t find that page</h1>
    <p className="mt-4 text-sm leading-7 text-[var(--muted)]">The link may be outdated, or the page may have moved. Your conversations are still in your account.</p>
    <div className="mt-7 flex flex-wrap gap-3"><Link href="/" className="btn btn-primary">Go to homepage</Link><Link href="/app/chats" className="btn btn-secondary">Open my chats</Link></div>
  </main>;
}
