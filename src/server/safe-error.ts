/** Never log raw provider/database errors: they can carry SQL parameters,
 * authentication headers, push subscriptions or private account details. */
export function safeError(error: unknown): { kind: string; code?: string } {
  const known = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError", "PasswordBusyError"]);
  const kind = error instanceof Error && known.has(error.name) ? error.name : "Error";
  const candidate = error && typeof error === "object" && "code" in error ? error.code : undefined;
  // PostgreSQL SQLSTATE codes describe categories without including values.
  const code = typeof candidate === "string" && /^[0-9A-Z]{5}$/.test(candidate) ? candidate : undefined;
  return { kind, ...(code ? { code } : {}) };
}
