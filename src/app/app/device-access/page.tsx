import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getDeviceSetupUser } from "@/server/session";
import { requireAdmin } from "@/server/admin";
import { AuthLayout } from "@/components/auth/auth-layout";
import { DeviceAccess } from "@/components/profile/device-access";
import { adminDestination, deviceAccessDestination } from "@/lib/device-access-navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Use Circlo on this device", robots: { index: false, follow: false } };

export default async function DeviceAccessPage({ searchParams }: { searchParams: Promise<{ next?: string; recovery?: string }> }) {
  const user = await getDeviceSetupUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const adminTarget = adminDestination(query.next);
  if (adminTarget) {
    // Existing APKs may already be parked on the old post-login setup URL.
    let permitted = false;
    try { await requireAdmin(); permitted = true; } catch { /* Keep normal device setup for other accounts. */ }
    if (permitted) redirect(adminTarget);
  }
  const [account] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1);
  const recoveryEmail = account?.emailVerifiedAt && !user.email.endsWith("@auth.maddychats.invalid") ? user.email : undefined;
  return <AuthLayout title="Set up this device" subtitle="Link this browser so your chats stay private.">
    <DeviceAccess recoveryEmail={recoveryEmail} next={deviceAccessDestination(query.next)} openRecovery={query.recovery === "1"} />
  </AuthLayout>;
}
