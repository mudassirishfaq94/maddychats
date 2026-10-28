import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { listConversationsFor } from "@/server/chat";
import { InitialInboxSnapshot } from "@/components/chats/initial-inbox-snapshot";
import { Suspense } from "react";

/** Fetch only on the inbox index; deep-linked chats keep their independent load. */
async function AuthorizedInboxSnapshot() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/app/chats");
  const conversations = await listConversationsFor(user.id).catch(() => undefined);
  return conversations ? <InitialInboxSnapshot viewerId={user.id} conversations={conversations}/> : null;
}

export default function ChatsIndexPage() {
  // Stream the already-authorized section shell while the full unread/list
  // query runs. Never seed protected rows before this request's authorization.
  return <Suspense fallback={null}><AuthorizedInboxSnapshot /></Suspense>;
}
