import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { SettingsSections } from "@/components/profile/settings-sections";
export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/settings");
  const [account] = await db.select({emailVerifiedAt:users.emailVerifiedAt}).from(users).where(eq(users.id,user.id)).limit(1);
  const recoveryEmail = account?.emailVerifiedAt && !user.email.endsWith("@auth.maddychats.invalid") ? user.email : undefined;
  return <SettingsSections recoveryEmail={recoveryEmail}/>;
}
