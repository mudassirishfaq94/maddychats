import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailForm key={token ?? "resend"} token={token ?? null} />;
}
