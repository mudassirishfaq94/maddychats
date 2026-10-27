export type ChallengeAction = "login" | "register" | "password_reset" | "email_verification";

export function challengeConfiguration(env: Record<string, string | undefined> = process.env) {
  const required = env.TURNSTILE_REQUIRED === "true";
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const configured = Boolean(siteKey && secret);
  return { enabled: required || Boolean(siteKey || secret), configured, siteKey, secret };
}

/** Cloudflare consumes each token once. Never log the token, secret or response. */
export async function verifyChallenge(
  token: unknown, action: ChallengeAction, hostname: string,
  config = challengeConfiguration(), request: typeof fetch = fetch,
): Promise<"ok" | "invalid" | "unavailable"> {
  if (!config.enabled) return "ok";
  if (!config.configured) return "unavailable";
  if (typeof token !== "string" || !token || token.length > 2048) return "invalid";
  try {
    const response = await request("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: config.secret, response: token }),
      signal: AbortSignal.timeout(5000), cache: "no-store",
    });
    if (!response.ok) return "unavailable";
    const result = await response.json() as { success?: unknown; hostname?: unknown; action?: unknown };
    return result.success === true && result.hostname === hostname && result.action === action ? "ok" : "invalid";
  } catch { return "unavailable"; }
}
