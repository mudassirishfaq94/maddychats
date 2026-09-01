import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getSessionUser } from "@/server/session";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Starred Messages" };
export const dynamic = "force-dynamic";

export default async function StarredLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/starred");

  return <AppShell user={user}>{children}</AppShell>;
}
