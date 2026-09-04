import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Already signed in? Skip straight to the app.
  const user = await getSessionUser();
  if (user) redirect("/app");

  const { next, error } = await searchParams;
  const googleError = error === "google_not_configured"
    ? "Google sign-in needs to be configured by the site owner."
    : error === "google_email_exists"
      ? "An account already uses that email. Sign in with your password."
      : error?.startsWith("google_")
        ? "Google sign-in could not be completed. Please try again."
        : null;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up right where you left off."
      footer={
        <>
          New to ZipTalk?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
          >
            Create an account
          </Link>
        </>
      }
    >
      {googleError ? <p role="alert" className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">{googleError}</p> : null}
      <LoginForm next={next} />
      <GoogleSignIn next={next} />
    </AuthLayout>
  );
}
