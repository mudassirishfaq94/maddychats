import { rateLimit } from "./rate-limit";
import { jsonError } from "./http";

/** Share the expensive decode/scan budget across every readable upload route. */
export async function guardReadableUploadBudget(userId: string) {
  const result = await rateLimit(`readable-upload:${userId}`, 20, 60000);
  return result.allowed ? null : jsonError(429, "Too many uploads. Try again later.");
}
