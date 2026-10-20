/** Report submission and blocking are separate operations; never imply a failed block succeeded. */
export async function requestUserBlock(userId: string, request: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await request(`/api/users/${encodeURIComponent(userId)}/block`, { method: "POST" });
    return response.ok;
  } catch { return false; }
}
