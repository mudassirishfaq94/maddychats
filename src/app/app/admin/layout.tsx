import type { ReactNode } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

/** Client navigation is convenience only; administrative pages are gated on the server. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try { await requireAdmin(); }
  catch {
    return <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-xl font-bold">Administrative access unavailable</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">Sign in with an administrator or moderator account and enable two-factor authentication in your profile.</p>
      <Link href="/app/profile" className="btn btn-primary">Open profile settings</Link>
    </div>;
  }
  return <AdminShell>{children}</AdminShell>;
}
