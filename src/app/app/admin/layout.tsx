import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/admin";
import AdminShell from "@/components/admin/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof Error && ["UNAUTHENTICATED", "FORBIDDEN", "ADMIN_MFA_REQUIRED"].includes(error.message)) notFound();
    throw error;
  }
  return <AdminShell>{children}</AdminShell>;
}
