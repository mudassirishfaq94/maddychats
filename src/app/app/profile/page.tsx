import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
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
import { NotificationPreferences } from "@/components/profile/notification-preferences";
import { AuthenticationMethods } from "@/components/profile/authentication-methods";
import { PrivacySettings } from "@/components/profile/privacy-settings";
import { LoginHistory } from "@/components/profile/login-history";
import { AccountDataSection } from "@/components/profile/account-data";
import { TwoFactorAuth } from "@/components/profile/two-factor-auth";
import { db } from "@/db";
import { oauthAccounts } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; auth_linked?: string; auth_error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/profile");
  const query = await searchParams;
  const identities = await db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id));
  const providers = new Set(identities.map((identity) => identity.provider));
  const initialMethods = {
    email: !user.email.endsWith("@auth.maddychats.invalid"),
    google: providers.has("google"),
  };
  const notice = query.auth_linked === "google"
    ? { kind: "success" as const, text: "Google was connected to this account." }
    : query.auth_error === "google_in_use"
      ? { kind: "error" as const, text: "That Google identity belongs to another ZipTalk account. Sign out and use Google sign-in to recover it; accounts are not merged automatically." }
      : query.auth_error === "google_already_linked"
        ? { kind: "error" as const, text: "A different Google identity is already connected to this account." }
        : null;

  const meta = [
    { icon: Mail, label: "Email", value: user.email },
    { icon: AtSign, label: "Username", value: `@${user.username}` },
    { icon: CalendarDays, label: "Member since", value: formatDate(user.createdAt) },
    { icon: Clock, label: "Last seen", value: timeAgo(user.lastSeenAt) },
  ];

  return (
    <AppShell user={user}>
    <div className="mx-auto h-full w-full min-w-0 max-w-5xl overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      <Link
        href="/app"
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)] animate-fade-up"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to overview
      </Link>

      {query.onboarding === "1" ? (
        <div className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-sm">
          <p className="font-semibold">Welcome to ZipTalk</p>
          <p className="mt-1 text-[var(--muted)]">Complete your display name, username, photo, and bio so people can recognize you.</p>
        </div>
      ) : null}

      {/* ---------- profile header ---------- */}
      <section
        className="card-glass mt-5 flex min-w-0 flex-col items-center gap-5 rounded-3xl p-5 text-center sm:mt-6 sm:flex-row sm:gap-6 sm:p-8 sm:text-left animate-fade-up"
        style={{ "--d": "80ms" } as React.CSSProperties}
      >
        <Avatar user={user} size={92} ring />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <h1 className="max-w-full break-words font-display text-2xl font-bold sm:text-3xl">{user.displayName}</h1>
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
      </section>

      {/* ---------- editor + meta ---------- */}
      <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <ProfileEditor user={user} />
          <AuthenticationMethods initialMethods={initialMethods} notice={notice} />
          <TwoFactorAuth />
          <NotificationPreferences />
          <PrivacySettings />
          <LoginHistory />
          <AccountDataSection />
        </div>

        <div className="min-w-0 space-y-4">
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
            <p className="mt-2.5 break-all font-mono text-[0.8rem] leading-relaxed text-[var(--muted)]">
              {user.id}
            </p>
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
