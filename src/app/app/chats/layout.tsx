import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getSessionUser } from "@/server/session";
import { ChatsLayout } from "@/components/chats/chats-layout";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

/** Deep links (/app/chats/[id]) share the same full-height chat surface. */
export default async function ChatsSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/chats");

  return (
    <>
      <ChatsLayout>{children}</ChatsLayout>
    </>
  );
}

