import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email tied to your account and we'll take it from there."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
