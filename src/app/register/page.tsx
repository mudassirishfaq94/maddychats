import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/register-form";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account. Every conversation, always in sync."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
