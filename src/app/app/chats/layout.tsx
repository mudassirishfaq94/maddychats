import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getSessionUser } from "@/server/session";
import { ChatsLayout } from "@/components/chats/chats-layout";
import { listConversationsFor } from "@/server/chat";
import { headers } from "next/headers";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

/** Deep links (/app/chats/[id]) share the same full-height chat surface. */
export default async function ChatsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, requestHeaders] = await Promise.all([getSessionUser(), headers()]);
  if (!user) redirect("/login?next=/app/chats");
  // A summary outage must retain the existing client retry path.
  const conversations = requestHeaders.get("x-circlo-pathname") === "/app/chats"
    ? await listConversationsFor(user.id).catch(() => undefined)
    : undefined;

  return (
    <>
      <ChatsLayout conversations={conversations}>{children}</ChatsLayout>
    </>
  );
}

