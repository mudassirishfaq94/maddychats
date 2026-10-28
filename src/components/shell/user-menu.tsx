"use client";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { SafeUser } from "@/lib/types";
export function UserMenu({user}:{user:SafeUser}) {
  return <Link href="/app/settings" prefetch={false} aria-label="Account settings" className="rounded-full border border-[var(--border)] p-1"><Avatar user={user} size={30} preview={false}/></Link>;
}
