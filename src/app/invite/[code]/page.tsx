import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { groupInviteLinks, conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/session";
import { acceptGroupInvite } from "@/server/group-invites";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = { title: "Join Group" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/invite/${code}`);

  // Find the invite
  const [link] = await db
    .select({
      id: groupInviteLinks.id,
      conversationId: groupInviteLinks.conversationId,
      expiresAt: groupInviteLinks.expiresAt,
      maxUses: groupInviteLinks.maxUses,
      useCount: groupInviteLinks.useCount,
    })
    .from(groupInviteLinks)
    .where(eq(groupInviteLinks.code, code))
    .limit(1);

  if (!link) notFound();

  // Check expiry
  if (link.expiresAt && link.expiresAt < new Date()) {
    return (
      <AppShell user={user}>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-bold">Link Expired</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This invite link has expired. Ask the group admin for a new one.
            </p>
            <a href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
              Back to chats
            </a>
          </div>
        </div>
      </AppShell>
    );
  }

  // Check max uses
  if (link.maxUses && link.useCount >= link.maxUses) {
    return (
      <AppShell user={user}>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-bold">Link Exhausted</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This invite link has been used too many times. Ask for a new one.
            </p>
            <a href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
              Back to chats
            </a>
          </div>
        </div>
      </AppShell>
    );
  }

  // Try to join
  const result = await acceptGroupInvite(code, user.id);

  if (result.success && result.conversationId) {
    redirect(`/app/chats/${result.conversationId}`);
  }

  return (
    <AppShell user={user}>
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold">Could Not Join</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {result.error || "Something went wrong."}
          </p>
          <a href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
            Back to chats
          </a>
        </div>
      </div>
    </AppShell>
  );
}
