import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/db";
import { groupInviteLinks, conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/server/session";
import { JoinGroupButton } from "@/components/chats/join-group-button";

export const metadata: Metadata = { title: "Join Group" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^(?:[a-f0-9]{12}|[a-f0-9]{32})$/.test(code)) notFound();
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
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-5 text-[var(--text)]">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-bold">Link Expired</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This invite link has expired. Ask the group admin for a new one.
            </p>
            <Link href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
              Back to chats
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Check max uses
  if (link.maxUses && link.useCount >= link.maxUses) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-5 text-[var(--text)]">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-bold">Link Exhausted</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              This invite link has been used too many times. Ask for a new one.
            </p>
            <Link href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
              Back to chats
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const [group] = await db.select({ name: conversations.name, type: conversations.type, deletedAt: conversations.deletedAt })
    .from(conversations).where(eq(conversations.id, link.conversationId)).limit(1);
  if (!group || group.type !== "group" || group.deletedAt) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-5 text-[var(--text)]">
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold">Join {group.name ?? "group"}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Join this group to take part in its encrypted conversations. Opening this link does not add you automatically.
          </p>
          <JoinGroupButton code={code} />
          <Link href="/app/chats" className="mt-4 inline-block text-sm font-medium text-[var(--accent)]">
            Back to chats
          </Link>
        </div>
      </div>
    </main>
  );
}
