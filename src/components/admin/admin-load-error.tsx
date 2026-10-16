"use client";
import Link from "next/link";
export function AdminLoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="mx-auto max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h1 className="text-xl font-semibold">Couldn’t load this admin page</h1><p className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">{message}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" className="btn btn-primary" onClick={retry}>Try again</button><Link href="/login?reauth=1&next=%2Fapp%2Fadmin" className="btn btn-secondary">Sign in again</Link></div></div>;
}
