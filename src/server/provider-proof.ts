import { createHash } from "node:crypto";
import { rateLimit } from "./rate-limit";

/** Store only a digest. The shared atomic budget outlives the accepted five-
 * minute provider freshness window, including bounded clock tolerance. */
export async function consumeProviderProof(provider: "google-native", token: string) {
  const digest = createHash("sha256").update(token).digest("hex");
  return (await rateLimit(`provider-proof:${provider}:${digest}`, 1, 10 * 60 * 1000)).allowed;
}
