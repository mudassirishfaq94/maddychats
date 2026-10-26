import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { listConversationsFor } from "@/server/chat";
import { InitialInboxSnapshot } from "@/components/chats/initial-inbox-snapshot";

/** Fetch only on the inbox index; deep-linked chats keep their independent load. */
export default async function ChatsIndexPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/chats");
  const conversations = await listConversationsFor(user.id).catch(() => undefined);
  return conversations ? <InitialInboxSnapshot viewerId={user.id} conversations={conversations}/> : null;
}
