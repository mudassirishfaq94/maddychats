/**
 * Admin guard — only the owner email can access admin routes.
 * In a real app you'd store an `isAdmin` column; this is a simple
 * hardcoded allowlist for a single-owner project.
 */

import { getSessionUser } from "./session";
import type { SafeUser } from "@/lib/types";

const ADMIN_EMAILS = [
  "mudassarmalak090@gmail.com",
];

export async function requireAdmin(): Promise<SafeUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!ADMIN_EMAILS.includes(user.email)) throw new Error("FORBIDDEN");
  return user;
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}
