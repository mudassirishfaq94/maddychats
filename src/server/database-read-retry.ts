const CONNECTION_FAILURES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "08001", "08006", "57P01"]);

function connectionFailed(error: unknown, depth = 0): boolean {
  if (depth > 4 || !error || typeof error !== "object") return false;
  const details = error as { code?: string; cause?: unknown; errors?: unknown[] };
  return CONNECTION_FAILURES.has(details.code ?? "") || connectionFailed(details.cause, depth + 1)
    || (Array.isArray(details.errors) && details.errors.some(cause => connectionFailed(cause, depth + 1)));
}

/** Only for read-only operations: never replay a write after a lost connection. */
export async function retryDatabaseRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (!connectionFailed(error)) throw error;
    await new Promise(resolve => setTimeout(resolve, 200));
    // Reread current state once. Persistent outages still fail closed.
    return read();
  }
}
