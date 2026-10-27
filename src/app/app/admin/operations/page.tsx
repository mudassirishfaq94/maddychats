"use client";

import Link from "next/link";
import { Activity, Download, Flag, HardDrive, Lock, RefreshCw, Timer, Users } from "lucide-react";
import { useAdminData } from "@/hooks/use-admin-data";
import { AdminLoadError } from "@/components/admin/admin-load-error";
import type { AdminOperations } from "@/lib/admin-operations";

function uptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  return hours ? `${hours} h ${Math.floor(seconds % 3600 / 60)} min` : `${Math.floor(seconds / 60)} min`;
}

export default function AdminOperationsPage() {
  const { data, error, loading, retry } = useAdminData<AdminOperations>("/api/admin/operations", 15000);
  if (!data && error) return <AdminLoadError message={error} retry={retry} />;
  if (!data || loading) return <p role="status" className="py-12 text-center text-sm text-[var(--muted)]">Checking the server…</p>;
  const cards = [
    { title: "Reports to review", value: data.attention.pendingReports, href: "/app/admin/reports", icon: Flag },
    { title: "Failed sign-ins · last 24 hours", value: data.attention.failedSignIns24h, href: "/app/admin/security", icon: Lock },
    { title: "Scheduled messages waiting", value: data.attention.scheduledWaiting, href: "/app/admin/activity", icon: Timer },
    { title: "Past their scheduled time", value: data.attention.scheduledDue, href: "/app/admin/activity", icon: Timer },
  ];
  function saveSnapshot() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `circlo-admin-check-${data!.observedAt.slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <div className="mx-auto min-w-0 max-w-5xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">Control room</h1><p className="mt-1 text-sm text-[var(--muted)]">Current checks, reports and sign-in activity in one place.</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={retry} className="btn btn-secondary min-h-11"><RefreshCw className="h-4 w-4" />Check now</button><button type="button" onClick={saveSnapshot} className="btn btn-secondary min-h-11"><Download className="h-4 w-4" />Save report</button></div>
    </header>
    {error ? <p role="alert" className="rounded-xl border border-[var(--border)] p-3 text-sm">The latest check failed. These readings are from {new Date(data.observedAt).toLocaleString()}. {error}</p> : null}
    <section aria-label="Application health" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Activity className="h-5 w-5" />Database connected</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <div><dt className="text-xs text-[var(--muted)]">Database check</dt><dd className="mt-1 font-semibold tabular-nums">{data.database.checkMs} ms</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">App running for</dt><dd className="mt-1 font-semibold tabular-nums">{uptime(data.application.uptimeSeconds)}</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">App memory</dt><dd className="mt-1 font-semibold tabular-nums">{data.application.memoryMb} MB</dd></div>
        <div><dt className="text-xs text-[var(--muted)]">Working memory</dt><dd className="mt-1 font-semibold tabular-nums">{data.application.heapUsedMb} MB</dd></div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Measurements cover this app process and the database query. They do not measure whole-server availability or message delivery speed.</p>
    </section>
    <section aria-label="Items to check" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(({ title, value, href, icon: Icon }) => <Link key={title} href={href} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)]"><Icon className="h-5 w-5 text-[var(--accent-fg)]" /><p className="mt-3 text-2xl font-bold tabular-nums">{value.toLocaleString()}</p><h2 className="mt-1 text-xs leading-5 text-[var(--muted)]">{title}</h2></Link>)}</section>
    <p className="text-xs leading-5 text-[var(--muted)]">A scheduled message may briefly appear as due while the worker sends it. Review repeated delays; this count alone does not prove a delivery failure.</p>
    <section aria-label="Admin shortcuts" className="grid gap-3 sm:grid-cols-3">{[
      { href: "/app/admin/users", title: "Manage accounts", text: "Search accounts and review permitted account actions.", icon: Users },
      { href: "/app/admin/storage", title: "Check file storage", text: "Review recorded upload sizes and usage.", icon: HardDrive },
      { href: "/app/admin/audit", title: "Review admin history", text: "See recorded administrative actions.", icon: Lock },
    ].map(({ href, title, text, icon: Icon }) => <Link key={href} href={href} className="rounded-2xl border border-[var(--border)] p-4"><Icon className="h-5 w-5" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{text}</p></Link>)}</section>
    <footer className="break-words text-xs leading-5 text-[var(--muted)]">Updated {new Date(data.observedAt).toLocaleString()} · Refreshes every 15 seconds while this page is visible. <span className="block">Web release: {data.appVersion}</span><span className="block">Saved reports contain these counts and readings, never private messages or sign-in secrets.</span></footer>
  </div>;
}
