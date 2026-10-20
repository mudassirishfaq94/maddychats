import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function CommunitiesLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/communities");
  return <AppShell user={user}>{children}</AppShell>;
}
