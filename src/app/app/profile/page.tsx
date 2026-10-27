import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import type * as React from "react";
import {
  AtSign,
  CalendarDays,
  Clock,
  Mail,
} from "lucide-react";
import { getSessionUser } from "@/server/session";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { EncryptionDevices } from "@/components/profile/encryption-devices";
import { AuthenticationMethods } from "@/components/profile/authentication-methods";
import { PasswordSettings } from "@/components/profile/password-settings";
import { Devices } from "@/components/profile/devices";
import Link from "next/link";
import { ProfileDisclosure } from "@/components/profile/profile-disclosure";
import { db } from "@/db";
import { oauthAccounts, users } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string; auth_linked?: string; auth_error?: string; recovery?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/profile");
  const query = await searchParams;
  const identities = await db
    .select({ provider: oauthAccounts.provider })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, user.id));
  const [accountSecurity] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1);
  const providers = new Set(identities.map((identity) => identity.provider));
  const initialMethods = {
    email: !user.email.endsWith("@auth.maddychats.invalid"),
    google: providers.has("google"),
  };
  const notice = query.auth_linked === "google"
    ? { kind: "success" as const, text: "Google was connected to this account." }
    : query.auth_error === "google_link_expired"
      ? { kind: "error" as const, text: "Google linking expired or your signed-in account changed. Sign in again, then choose Add Google on this profile." }
    : query.auth_error === "google_in_use"
          ? { kind: "error" as const, text: "That Google account is already linked to another Circlo account. Sign out and use it to sign in; accounts are not combined automatically." }
      : query.auth_error === "google_already_linked"
          ? { kind: "error" as const, text: "A different Google account is already linked here." }
        : null;

  const meta = [
    { icon: Mail, label: "Email", value: user.email },
    { icon: AtSign, label: "Username", value: `@${user.username}` },
    { icon: CalendarDays, label: "Member since", value: formatDate(user.createdAt) },
    { icon: Clock, label: "Last seen", value: timeAgo(user.lastSeenAt) },
  ];

  return (
    <>
    <div className="mx-auto h-full w-full min-w-0 max-w-5xl overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      {query.onboarding === "1" ? (
        <div className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-sm">
          <p className="font-semibold">Welcome to Circlo</p>
          <p className="mt-1 text-[var(--muted)]">Complete your display name, username, photo, and bio so people can recognize you.</p>
        </div>
      ) : null}

      {/* ---------- profile header ---------- */}
      <section
        className="card-glass mt-5 flex min-w-0 items-center gap-4 rounded-3xl p-4 text-left sm:mt-6 sm:gap-6 sm:p-6 animate-fade-up"
        style={{ "--d": "80ms" } as React.CSSProperties}
      >
        <Avatar user={user} size={64} ring />
        <div className="w-full min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="max-w-full break-words font-display text-xl font-bold sm:text-2xl">{user.displayName}</h1>
            <span className="badge badge-accent">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
              Online
            </span>
          </div>
          <p className="mt-1.5 break-all text-[var(--muted)]">@{user.username}</p>
          <p className="mt-3 max-w-lg break-words text-sm leading-relaxed text-[var(--muted)]">
            {user.bio ?? "No bio yet — hit Edit profile to introduce yourself."}
          </p>
        </div>
      </section>

      {/* ---------- editor + meta ---------- */}
      <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <ProfileEditor user={user} />
          <ProfileDisclosure title="Private chats and devices" description="Link a new phone, save a copy of your chats, or keep a spare key for older chats." anchors={["encryption-devices", "cloud-recovery", "local-chat-backup"]} defaultOpen={query.recovery === "1"}>
            <EncryptionDevices openRecovery={query.recovery === "1"} recoveryEmail={accountSecurity?.emailVerifiedAt && !user.email.endsWith("@auth.maddychats.invalid") ? user.email : undefined} />
          </ProfileDisclosure>
          <ProfileDisclosure title="Sign-in and account safety" description="Manage sign-in methods and devices signed into your account." anchors={["account-security", "devices", "authentication-methods"]} defaultOpen={Boolean(notice)}>
            <div id="account-security" className="space-y-4"><AuthenticationMethods initialMethods={initialMethods} notice={notice} /><ProfileDisclosure title="Password" description="Set or change your password."><PasswordSettings email={user.email} google={initialMethods.google} /></ProfileDisclosure><Devices /></div>
          </ProfileDisclosure>
          <Link href="/app/settings" className="flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-4"><span className="min-w-0 flex-1"><span className="block font-semibold">Notifications, privacy and extra sign-in check</span><span className="mt-1 block text-xs text-[var(--muted)]">These live in Settings.</span></span><span aria-hidden className="text-[var(--muted)]">›</span></Link>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="card-flat rounded-2xl p-5"><h2 className="font-semibold">Account overview</h2><dl className="mt-3 divide-y divide-[var(--border)]">
            {meta.map(({ icon: Icon, label, value }) => <div key={label} className="py-3"><dt className="flex items-center gap-2 text-xs text-[var(--muted)]"><Icon className="h-3.5 w-3.5" />{label}</dt><dd className="mt-1 break-all text-sm">{value}</dd></div>)}
          </dl></div>

        </div>
      </div>
    </div>
    </>
  );
}

