const DEVICE_LINK_QR_KIND = "circlo-device-link";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type DeviceLinkQrPayload = { kind: typeof DEVICE_LINK_QR_KIND; version: 1; requestId: string; token: string };

export function createDeviceLinkQrPayload(requestId: string, token: string): string {
  if (!UUID.test(requestId) || !TOKEN.test(token)) throw new Error("Invalid device-link QR payload.");
  return JSON.stringify({ kind: DEVICE_LINK_QR_KIND, version: 1, requestId, token } satisfies DeviceLinkQrPayload);
}

export function parseDeviceLinkQrPayload(raw: string): DeviceLinkQrPayload | null {
  if (raw.length > 512) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.kind !== DEVICE_LINK_QR_KIND || value.version !== 1 || typeof value.requestId !== "string" || !UUID.test(value.requestId) || typeof value.token !== "string" || !TOKEN.test(value.token)) return null;
    return { kind: DEVICE_LINK_QR_KIND, version: 1, requestId: value.requestId, token: value.token };
  } catch {
    return null;
  }
}
