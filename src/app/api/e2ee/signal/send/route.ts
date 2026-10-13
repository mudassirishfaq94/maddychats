import { jsonError } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Quarantined experimental transport. Its former write path bypassed normal
 * block, message-request, deleted-group, and group messaging policies.
 * Keep unavailable until those controls and the cryptographic transport have
 * been independently reviewed. The supported encrypted /messages API remains
 * the production send path. An environment toggle cannot bypass this quarantine.
 */
export async function POST() {
  return jsonError(503, "The experimental Signal transport is unavailable. Use the supported encrypted chat transport.");
}
