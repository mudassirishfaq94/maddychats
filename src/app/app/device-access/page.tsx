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
  const query = await searchParams;
  const user = await getDeviceSetupUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(deviceAccessDestination(query.next))}`);
  const adminTarget = adminDestination(query.next);
  if (adminTarget) {
    // Existing APKs may already be parked on the old post-login setup URL.
    let permitted = false;
    try { await requireAdmin(); permitted = true; } catch { /* Keep normal device setup for other accounts. */ }
    if (permitted) redirect(adminTarget);
  }
  const [account] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1);
  const recoveryEmail = account?.emailVerifiedAt && !user.email.endsWith("@auth.maddychats.invalid") ? user.email : undefined;
  return <AuthLayout title="Open Circlo on this phone" subtitle="Choose how to bring your chats with you.">
    <DeviceAccess recoveryEmail={recoveryEmail} next={deviceAccessDestination(query.next)} openRecovery={query.recovery === "1"} />
  </AuthLayout>;
}
