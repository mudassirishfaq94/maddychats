import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
/** AudioCallProvider owns signaling and consent; no chat history is mounted here. */
export default async function CallPage({ searchParams }: { searchParams: Promise<{ call?: string }> }) {
  if (!(await getSessionUser())) redirect("/login?next=%2Fapp%2Fcall");
  const { call } = await searchParams;
  if (!call || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(call)) redirect("/app/chats");
  return <main className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center">
    <span className="text-lg font-semibold text-[var(--accent)]">circlo</span>
    <p className="text-sm text-[var(--muted)]">Connecting your call…</p>
  </main>;
}
