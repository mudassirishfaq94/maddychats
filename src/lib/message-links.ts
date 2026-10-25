export type MessageTextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const LINK_PATTERN = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

/** Split message text into safe web links and ordinary text without changing copy. */
export function splitMessageLinks(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(LINK_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    let value = raw.replace(TRAILING_PUNCTUATION, "");
    while (value.endsWith(")") && (value.match(/\(/g)?.length ?? 0) < (value.match(/\)/g)?.length ?? 0)) {
      value = value.slice(0, -1);
    }
    if (!value) continue;

    const href = value.toLowerCase().startsWith("www.") ? `https://${value}` : value;
    let safe = false;
    try {
      const parsed = new URL(href);
      safe = (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
    } catch {
      // Leave malformed URL-like text untouched.
    }
    if (!safe) continue;

    if (start > cursor) parts.push({ type: "text", value: text.slice(cursor, start) });
    parts.push({ type: "link", value, href });
    cursor = start + value.length;
  }

  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", value: text }];
}
