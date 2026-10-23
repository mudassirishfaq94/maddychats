import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/server/session";
import { ChatsLayout } from "@/components/chats/chats-layout";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

/**
 * Authenticated home IS the chat surface — messaging is the product, not a
 * dashboard. The selection-empty state renders inside ChatsLayout.
 */
export default async function AppHome() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <>
      <ChatsLayout>
        {null}
      </ChatsLayout>
    </>
  );
}

