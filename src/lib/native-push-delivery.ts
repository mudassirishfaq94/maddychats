import type { nativePushPayload } from "./native-push-payload";

/** Injectable transport keeps token retirement testable without provider calls. */
export async function deliverNativePush(
  tokens: { token: string }[], payload: ReturnType<typeof nativePushPayload>,
  send: (message: ReturnType<typeof nativePushPayload> & { token: string }) => Promise<unknown>,
  retire: (token: string) => Promise<void>, failed: (code: string) => void,
  accepted: (elapsedMs: number) => void = () => {},
): Promise<void> {
  await Promise.all(tokens.map(async ({ token }) => {
    const startedAt = Date.now();
    try {
      await send({ token, ...payload });
      accepted(Date.now() - startedAt);
    }
    catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
      if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") await retire(token);
      else failed(code); // Transient provider errors must not delete a working token.
    }
  }));
}
