import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { AppShell } from "@/components/shell/app-shell";
import { CallHistory } from "@/components/calls/call-history";
export const dynamic="force-dynamic";
export default async function Page(){const user=await getSessionUser();if(!user)redirect("/login?next=/app/calls");return <AppShell user={user}><CallHistory/></AppShell>;}
