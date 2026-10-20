import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { StatusEntry } from "@/components/status/status-entry";
import { getSessionUser } from "@/server/session";
export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await getSessionUser(); if (!user) redirect("/login?next=/app/status");
  return <><StatusEntry me={user} /></>;
}
