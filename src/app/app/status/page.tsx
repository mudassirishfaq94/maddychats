import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { StatusPage } from "@/components/status/status-page";
import { getSessionUser } from "@/server/session";
import { listVisibleStatuses } from "@/server/status";
export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSessionUser(); if (!user) redirect("/login?next=/app/status");
  return <AppShell user={user}><StatusPage me={user} initial={await listVisibleStatuses(user.id)} /></AppShell>;
}
