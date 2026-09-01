import { NextRequest, NextResponse } from "next/server";
import { clientUrl } from "./config";

/** Consistent, safe error envelope: never leaks internals. */
export function jsonError(
  status: number,
  message: string,
  fields?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: message, ...(fields ? { fields } : {}) },
    { status },
  );
}

/**
 * JSON request bodies are hard-capped at 64 KB — every JSON schema in this
 * app is far smaller, so anything bigger is abusive and gets rejected before
 * it is ever parsed.
 */
const MAX_JSON_BODY_BYTES = 64 * 1024;

/** Parses a JSON request body; returns null on malformed/oversized input. */
export async function readJson(
  req: NextRequest,
): Promise<Record<string, unknown> | null> {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
    return null;
  }
  try {
    const data: unknown = await req.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Multipart upload cap: 5 files × 25 MB + request overhead. Enforced from
 * Content-Length before any formData parsing happens.
 */
export function guardUploadSize(req: NextRequest): NextResponse | null {
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > 135 * 1024 * 1024) {
    return jsonError(413, "Upload too large.");
  }
  return null;
}

/** Best-effort client IP for rate limiting. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Hostnames that are always treated as plain-http development. */
const DEV_HOST_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|.*\.local|.*\.internal)(:\d+)?$/i;

/**
 * Whether this request arrived over HTTPS. Drives the session cookie's
 * Secure flag + SameSite=None pairing.
 *
 * Detection strategy, in order:
 *  1. Secure-context hint — the client appends `x-secure-context: 1` to
 *     auth requests when `window.location.protocol` is HTTPS. This is the
 *     ground truth behind opaque preview proxies that strip/rewrite the
 *     forwarding headers. (Cookie attributes are not an authz decision —
 *     worst case a caller downgrades or upgrades their own cookie, which
 *     affects only their own session storage rules. CSRF defense remains
 *     the Origin allow-list guard.)
 *  2. CLIENT_URL override — when the request host matches CLIENT_URL's
 *     host, its scheme decides.
 *  3. Common TLS-terminator headers (x-forwarded-proto/scheme, Forwarded,
 *     x-forwarded-ssl, front-end-https, cf-visitor).
 *  4. Host heuristic — any non-local public host is assumed TLS.
 */
export function requestIsSecure(req: NextRequest): boolean {
  const hint = req.headers.get("x-secure-context");
  if (hint === "1") return true;

  const host = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();

  const configured = process.env.CLIENT_URL;
  if (configured) {
    try {
      const cu = new URL(configured);
      if (host && host === cu.host.toLowerCase()) {
        return cu.protocol === "https:";
      }
    } catch {
      // malformed CLIENT_URL — fall through to header/host detection
    }
  }

  const protoHeader =
    req.headers.get("x-forwarded-proto") ?? req.headers.get("x-forwarded-scheme");
  if (protoHeader) {
    return protoHeader.split(",")[0].trim().toLowerCase() === "https";
  }

  const forwarded = req.headers.get("forwarded");
  if (forwarded) {
    const match = /proto=(https)/i.exec(forwarded);
    if (match) return true;
    if (/proto=http[^s]/i.test(forwarded)) return false;
  }

  if (req.headers.get("x-forwarded-ssl")?.toLowerCase() === "on") return true;
  if (req.headers.get("front-end-https")?.toLowerCase() === "on") return true;

  const cfVisitor = req.headers.get("cf-visitor");
  if (cfVisitor) return cfVisitor.includes('"scheme":"https"');

  if (req.nextUrl.protocol === "https:") return true;

  return host !== "" && !DEV_HOST_PATTERN.test(host);
}

/**
 * Origin allow-list guard for mutating routes (CORS policy).
 *
 * The client is same-origin, so browser requests must carry an Origin whose
 * host matches this server (or CLIENT_URL). Non-browser clients without an
 * Origin header are unaffected; cross-origin browser calls are rejected.
 */
export function guardSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    const o = new URL(origin);
    const allowed = new Set<string>();
    const host = req.headers.get("host");
    if (host) allowed.add(host);
    allowed.add(new URL(clientUrl()).host);
    if (allowed.has(o.host)) return null;
  } catch {
    // fall through to rejection
  }
  return jsonError(403, "Cross-origin requests are not allowed.");
}
