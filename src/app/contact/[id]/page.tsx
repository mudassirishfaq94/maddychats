import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/server/session";
import { findUserById, isUuid, toPublicUser } from "@/server/users";
import { isBlockedBetween } from "@/server/chat";
import { Avatar } from "@/components/avatar";
import { AddQrContact } from "@/components/people/add-qr-contact";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!isUuid(id))notFound();const me=await getSessionUser();if(!me)redirect(`/login?next=/contact/${id}`);
  const person=await findUserById(id);if(!person||person.suspendedAt||await isBlockedBetween(me.id,id))notFound();
  return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] p-5"><section className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center"><div className="flex justify-center"><Avatar user={toPublicUser(person)} size={72}/></div><h1 className="mt-4 text-2xl font-bold">{person.displayName}</h1><p className="mb-6 mt-1 text-sm text-[var(--muted)]">@{person.username}</p>{id!==me.id?<AddQrContact userId={id}/>:<p>This is your contact code.</p>}<Link href="/app/people" className="mt-5 block text-sm text-[var(--accent)]">Back to People</Link></section></main>;
}
