import { clientUrl } from "./config";
import { jsonError } from "./http";
import { challengeConfiguration, verifySingleUseChallenge, type ChallengeAction } from "./turnstile";
import { rateLimit } from "./rate-limit";

export async function guardAuthChallenge(body: Record<string, unknown> | null, action: ChallengeAction) {
  const result = await verifySingleUseChallenge(body?.turnstileToken, action, new URL(clientUrl()).hostname,
    challengeConfiguration(), async digest => (await rateLimit(`auth-proof:${digest}`, 1, 5 * 60 * 1000)).allowed);
  if (result === "ok") return null;
  const response = jsonError(result === "unavailable" ? 503 : 403, result === "unavailable"
    ? "The security check is temporarily unavailable. Please try again shortly."
    : "Please complete the security check and try again.");
  response.headers.set("Cache-Control", "no-store");
  if (result === "unavailable") response.headers.set("Retry-After", "10");
  return response;
}
