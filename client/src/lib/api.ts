// Thin fetch wrapper for the Maddy Chats API.
//
// All requests are same-origin relative URLs ("/api/...") which the dev server
// proxies to the Express backend. Cookies (the HttpOnly JWT) are sent
// automatically via `credentials: "include"`. No secrets ever live here.

export type ApiFieldErrors = Record<string, string>;

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: ApiFieldErrors;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: ApiFieldErrors
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: { fields?: ApiFieldErrors } } })?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "ERROR",
      err?.message ?? "Something went wrong.",
      err?.details?.fields
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
};
