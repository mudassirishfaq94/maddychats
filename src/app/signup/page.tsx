import { TemporaryChatEntry } from "@/components/auth/temporary-chat-entry";
import { verificationDeliveryConfigured } from "@/server/email-verification";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignupOptions } from "@/components/auth/signup-options";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign up" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const user = await getSessionUser();
  if (user) redirect("/app");

  return (
    <AuthLayout
      entry={<TemporaryChatEntry />}
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
      {!verificationDeliveryConfigured() && <p className="mb-4 text-sm text-[var(--muted)]">Email verification is temporarily unavailable. You can create an account, but you will need to verify your email before you can sign in.</p>}
      {query.error === "consent_required" ? <p role="alert" className="mb-4 text-sm">Please agree to both policies below to create your account.</p> : null}
      <SignupOptions />
    </AuthLayout>
  );
}
