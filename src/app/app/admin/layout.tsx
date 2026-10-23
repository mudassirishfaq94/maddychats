import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/server/admin";
import AdminShell from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=%2Fapp%2Fadmin");
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
        <h1 className="font-display text-3xl font-semibold">Administrator access required</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">This account does not have an administrator role. Sign in with your administrator account, or ask an existing administrator to assign access.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link href="/login?reauth=1&next=%2Fapp%2Fadmin" className="btn btn-primary">Use another account</Link><Link href="/app/chats" className="btn btn-secondary">Back to chats</Link></div>
      </main>;
    }
    if (error instanceof Error && error.message === "ADMIN_MFA_REQUIRED") {
      return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-12">
        <h1 className="font-display text-3xl font-semibold">Secure your admin account</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">Your account has administrator access. Turn on two-step verification before opening the dashboard. This extra check protects everyone’s accounts.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/app/settings#two-step-verification" className="btn btn-primary">Set up two-step verification</Link>
          <Link href="/app/chats" className="btn btn-secondary">Back to chats</Link>
        </div>
        <p className="mt-5 text-sm text-[var(--muted)]">After setup, sign in again with your verification code, then return to the dashboard.</p>
        <Link href="/app/admin" className="mt-3 w-fit text-sm underline">Open admin dashboard</Link>
      </main>;
    }
    throw error;
  }
  return <AdminShell>{children}</AdminShell>;
}
