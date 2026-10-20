import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getDeviceSetupUser } from "@/server/session";
import { AuthLayout } from "@/components/auth/auth-layout";
import { DeviceAccess } from "@/components/profile/device-access";
import { deviceAccessDestination } from "@/lib/device-access-navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Use Circlo on this device", robots: { index: false, follow: false } };

export default async function DeviceAccessPage({ searchParams }: { searchParams: Promise<{ next?: string; recovery?: string }> }) {
  const user = await getDeviceSetupUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const [account] = await db.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1);
  const recoveryEmail = account?.emailVerifiedAt && !user.email.endsWith("@auth.maddychats.invalid") ? user.email : undefined;
  return <AuthLayout title="Confirm this device" subtitle="Your account is verified. Complete this check to sign in.">
    <DeviceAccess recoveryEmail={recoveryEmail} next={deviceAccessDestination(query.next)} openRecovery={query.recovery === "1"} />
  </AuthLayout>;
}
