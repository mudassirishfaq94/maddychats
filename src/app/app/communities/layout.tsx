import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function CommunitiesLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/communities");
  return <>{children}</>;
}
