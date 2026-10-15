import { MfaForm } from "@/components/auth/mfa-form";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginOptions } from "@/components/auth/login-options";
import { getSessionUser, getSessionAccess } from "@/server/session";
import { deviceAccessPath } from "@/lib/device-access-navigation";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mfa?: string; reauth?: string; emailProof?: string; passwordChanged?: string }>;
}) {
  const { next, error, mfa, reauth, emailProof, passwordChanged } = await searchParams;
  const user = await getSessionUser();
  if ((await getSessionAccess())?.approvalRequired && mfa !== "1" && reauth !== "1") redirect(deviceAccessPath(next));
  if (user && mfa !== "1" && reauth !== "1") redirect("/app");
  const googleError = error === "consent_required"
    ? "Agree to both the Terms and Conditions and Privacy Policy before signing in."
    : error === "google_not_configured"
    ? "Google sign-in needs to be configured by the site owner."
    : (error === "google_email_exists" || error === "google_link_required")
      ? "An account already uses that email. Sign in with your existing password, then link Google in your profile."
      : error?.startsWith("google_")
        ? "Google sign-in could not be completed. Please try again."
        : null;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up right where you left off."
      footer={
        <>
          New to Circlo?{" "}
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
      {reauth === "1" ? <p role="status" className="mb-4 text-sm">Please sign in again to confirm it is you before continuing with your account security settings.</p> : null}
      {passwordChanged === "1" ? <p role="status" className="mb-4 text-sm">Password updated. Sign in again with your new password or Google.</p> : null}
      {mfa === "1" ? <MfaForm next={next} /> : <>
        {process.env.STARTER_MODE === "1" ? <p className="mb-4 text-sm text-[var(--muted)]">{emailProof === "google" ? "Google verified your email. Enter your existing password to continue." : "New here? Continue with Google. If password sign-in asks for verification, continue with Google first, then enter your existing password."}</p> : null}
        <LoginOptions next={next} phoneEnabled={process.env.STARTER_MODE !== "1"} />
      </>}
    </AuthLayout>
  );
}
