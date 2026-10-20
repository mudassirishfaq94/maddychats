import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: {
  searchParams: Promise<{ token?: string; delivery?: string }>;
}) {
  const { token, delivery } = await searchParams;
  return <VerifyEmailForm key={token ?? "resend"} token={token ?? null} deliveryUnavailable={delivery === "unavailable"} googleVerification={process.env.STARTER_MODE === "1" && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />;
}
