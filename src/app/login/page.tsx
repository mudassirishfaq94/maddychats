import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in? Skip straight to the app.
  const user = await getSessionUser();
  if (user) redirect("/app");

  const { next } = await searchParams;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up right where you left off."
      footer={
        <>
          New to Maddy Chats?{" "}
          <Link
            href="/register"
            className="font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthLayout>
  );
}
