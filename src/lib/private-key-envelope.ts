/** Structural check, not proof of the private key or secrecy of its wrapping factor. */
export function isCurrentPrivateKeyEnvelope(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 16384 || !value.startsWith("v2:")) return false;
  const encoded = value.slice(3);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
  try {
    const decoded = atob(encoded);
    // Salt16 + IV12 + GCM tag16 + at least one byte of encrypted key material.
    return decoded.length >= 45 && btoa(decoded) === encoded;
  } catch { return false; }
}
