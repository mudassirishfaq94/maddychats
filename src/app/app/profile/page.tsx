import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";

import { getSessionUser } from "@/server/session";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { AuthenticationMethods } from "@/components/profile/authentication-methods";
import { PasswordSettings } from "@/components/profile/password-settings";
import { Devices } from "@/components/profile/devices";
import { ProfileDisclosure } from "@/components/profile/profile-disclosure";
import { db } from "@/db";
import { oauthAccounts } from "@/db/schema";

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


  return (
    <>
    <div className="mx-auto h-full w-full min-w-0 max-w-5xl overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-6 sm:py-6">
      {query.onboarding === "1" ? (
        <div className="mt-5 rounded-2xl border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] p-4 text-sm">
          <p className="font-semibold">Welcome to Circlo</p>
          <p className="mt-1 text-[var(--muted)]">Complete your display name, username, photo, and bio so people can recognize you.</p>
        </div>
      ) : null}

      <h1 className="font-display text-2xl font-bold">Profile</h1>
      {/* ---------- editor + meta ---------- */}
      <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-5 ">
        <div className="min-w-0 space-y-5">
          <ProfileEditor user={user} />
          <ProfileDisclosure title="More account options" description="Google, passwords, and signed-in sessions." anchors={["account-security", "devices", "authentication-methods"]} defaultOpen={Boolean(notice)}>
            <div id="account-security" className="space-y-4"><AuthenticationMethods initialMethods={initialMethods} notice={notice} /><ProfileDisclosure title="Password" description="Set or change your password."><PasswordSettings email={user.email} google={initialMethods.google} /></ProfileDisclosure><Devices /></div>
          </ProfileDisclosure>

        </div>


      </div>
    </div>
    </>
  );
}
