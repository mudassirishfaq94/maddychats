import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/register-form";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { PhoneSignIn } from "@/components/auth/phone-sign-in";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign up" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
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
      <GoogleSignIn />
      <PhoneSignIn />
    </AuthLayout>
  );
}
