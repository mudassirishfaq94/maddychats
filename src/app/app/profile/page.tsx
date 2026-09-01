import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  AtSign,
  CalendarDays,
  Clock,
  Fingerprint,
  Mail,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { AppShell } from "@/components/shell/app-shell";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { Avatar } from "@/components/avatar";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/profile");

  const meta = [
    { icon: Mail, label: "Email", value: user.email },
    { icon: AtSign, label: "Username", value: `@${user.username}` },
    { icon: CalendarDays, label: "Member since", value: formatDate(user.createdAt) },
    { icon: Clock, label: "Last seen", value: timeAgo(user.lastSeenAt) },
  ];

  return (
    <AppShell user={user}>
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)] animate-fade-up"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to overview
      </Link>

      {/* ---------- profile header ---------- */}
      <section
        className="card-glass mt-6 flex flex-col items-start gap-6 rounded-3xl p-8 sm:flex-row sm:items-center animate-fade-up"
        style={{ "--d": "80ms" } as React.CSSProperties}
      >
        <Avatar user={user} size={92} ring />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-bold">{user.displayName}</h1>
            <span className="badge badge-accent">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Online
            </span>
          </div>
          <p className="mt-1.5 text-[var(--muted)]">@{user.username}</p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
            {user.bio ?? "No bio yet — hit Edit profile to introduce yourself."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5 self-stretch rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-3 sm:items-end">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Avatar
          </span>
          <span className="text-xs text-[var(--muted)]">
            Use the camera button below to update it
          </span>
        </div>
      </section>

      {/* ---------- editor + meta ---------- */}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
        <ProfileEditor user={user} />

        <div className="space-y-4">
          {meta.map(({ icon: Icon, label, value }, i) => (
            <div
              key={label}
              className="card-flat rounded-2xl p-5 animate-fade-up"
              style={{ "--d": `${220 + i * 60}ms` } as React.CSSProperties}
            >
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
                {label}
              </p>
              <p className="mt-2.5 break-words text-[0.95rem] font-medium leading-relaxed">
                {value}
              </p>
            </div>
          ))}
          <div
            className="card-flat rounded-2xl p-5 animate-fade-up"
            style={{ "--d": "460ms" } as React.CSSProperties}
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Fingerprint className="h-3.5 w-3.5 text-[var(--accent)]" />
              User ID
            </p>
            <p className="mt-2.5 font-mono text-[0.8rem] leading-relaxed text-[var(--muted)]">
              {user.id}
            </p>
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
