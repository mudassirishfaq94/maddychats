import { createHash } from "node:crypto";

export type ChallengeAction = "login" | "register" | "password_reset" | "email_verification";

export function challengeConfiguration(env: Record<string, string | undefined> = process.env) {
  const required = env.TURNSTILE_REQUIRED === "true";
  const siteKey = env.TURNSTILE_SITE_KEY?.trim() ?? "";
  const secret = env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  const testKeys = /^(?:1|2|3)x0{10,}/.test(siteKey) || /^(?:1|2|3)x0{10,}/.test(secret);
  const configured = Boolean(siteKey && secret) && !(env.NODE_ENV === "production" && testKeys);
  return { enabled: required || Boolean(siteKey || secret), configured, siteKey, secret };
}

/** Enforce single use in our shared store even if a provider retries a successful result. */
export async function verifySingleUseChallenge(
  token: unknown, action: ChallengeAction, hostname: string,
  config: ReturnType<typeof challengeConfiguration>, consume: (digest: string) => Promise<boolean>,
  request: typeof fetch = fetch,
) {
  const result = await verifyChallenge(token, action, hostname, config, request);
  if (result !== "ok" || !config.enabled) return result;
  try {
    return await consume(createHash("sha256").update(token as string).digest("hex")) ? "ok" : "invalid";
  } catch { return "unavailable"; }
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
