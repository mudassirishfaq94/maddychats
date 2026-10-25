const SAFE_INLINE_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

/** Normalize parameters/case before checking this explicit, passive document allowlist. */
export function isSafeInlineDocumentType(mimeType: string): boolean {
  return SAFE_INLINE_DOCUMENT_TYPES.has(mimeType.split(";")[0].trim().toLowerCase());
}

/** Encode user filenames as data, never as header delimiters. */
export function contentDisposition(name: string, inline: boolean): string {
  const safe = name.replace(/[^\w .()-]/g, "_").slice(0, 180) || "download";
  const wellFormed = new TextDecoder().decode(new TextEncoder().encode(name.slice(0, 255)));
  const encoded = encodeURIComponent(wellFormed).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
