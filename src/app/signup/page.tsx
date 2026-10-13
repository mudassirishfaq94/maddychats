import { verificationDeliveryConfigured } from "@/server/email-verification";
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
      subtitle="One account. Your circle, always within reach."
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
      {!verificationDeliveryConfigured() && <p className="mb-4 text-sm text-[var(--muted)]">Email accounts need verification before sign-in. Email delivery is currently unavailable; Google sign-in is also available.</p>}
      <RegisterForm />
      <GoogleSignIn />
      {process.env.STARTER_MODE !== "1" ? <PhoneSignIn signup /> : null}
    </AuthLayout>
  );
}
