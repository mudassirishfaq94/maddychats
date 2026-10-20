/** Encode user filenames as data, never as header delimiters. */
export function contentDisposition(name: string, inline: boolean): string {
  const safe = name.replace(/[^\w .()-]/g, "_").slice(0, 180) || "download";
  const wellFormed = new TextDecoder().decode(new TextEncoder().encode(name.slice(0, 255)));
  const encoded = encodeURIComponent(wellFormed).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
