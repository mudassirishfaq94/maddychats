/** Bound both response headers and body; key endpoints return small JSON. */
export async function e2eeRequest(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 15000);
  const parentSignal = init.signal;
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  const signal = controller.signal;
  try {
    const response = await fetch(input, { ...init, signal });
    const body = await response.arrayBuffer();
    signal.throwIfAborted();
    return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (cause) {
    if (signal.aborted) throw new Error("Encryption request timed out or was cancelled. Please retry.", { cause });
    throw cause;
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abort);
  }
}

/** Cancel waiting on a shared, read-only key load without disrupting other readers. */
export function awaitE2EERead<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Device restoration timed out. Please retry."));
    if (signal.aborted) { void pending.catch(() => undefined); abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
