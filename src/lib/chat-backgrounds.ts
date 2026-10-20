import type { CSSProperties } from "react";

export const CHAT_BACKGROUNDS = [
  { key: "default", label: "Default", color: "var(--surface)", ink: "var(--text)" },
  { key: "ocean", label: "Ocean", color: "linear-gradient(135deg, #0891b2, #1d4ed8)", ink: "#ffffff" },
  { key: "forest", label: "Forest", color: "linear-gradient(135deg, #15803d, #064e3b)", ink: "#ffffff" },
  { key: "midnight", label: "Midnight", color: "linear-gradient(135deg, #111827, #312e81)", ink: "#ffffff" },
  { key: "sunset", label: "Sunset", color: "linear-gradient(135deg, #ff6b6b, #7c3aed)", ink: "#ffffff" },
  { key: "rose", label: "Rose", color: "linear-gradient(135deg, #e11d48, #9333ea)", ink: "#ffffff" },
  { key: "lavender", label: "Lavender", color: "linear-gradient(135deg, #a78bfa, #818cf8)", ink: "#17132b" },
  { key: "mint", label: "Mint", color: "linear-gradient(135deg, #34d399, #06b6d4)", ink: "#102f2b" },
  { key: "peach", label: "Peach", color: "linear-gradient(135deg, #ffedd5, #fed7aa)", ink: "#431407" },
  { key: "sage", label: "Sage", color: "linear-gradient(135deg, #e7f0df, #b9d3b0)", ink: "#18351e" },
  { key: "sky", label: "Sky", color: "linear-gradient(135deg, #e0f2fe, #bae6fd)", ink: "#0c334b" },
  { key: "lilac", label: "Lilac", color: "linear-gradient(135deg, #f3e8ff, #ddd6fe)", ink: "#392254" },
  { key: "sand", label: "Sand", color: "linear-gradient(135deg, #faf3e0, #e8d5b7)", ink: "#463625" },
  { key: "blush", label: "Blush", color: "linear-gradient(135deg, #fff1f2, #fecdd3)", ink: "#571c32" },
  { key: "seafoam", label: "Seafoam", color: "linear-gradient(135deg, #d1fae5, #a5f3fc)", ink: "#13433b" },
  { key: "slate", label: "Slate", color: "linear-gradient(135deg, #334155, #0f172a)", ink: "#ffffff" },
  { key: "plum", label: "Plum", color: "linear-gradient(135deg, #581c87, #2e1065)", ink: "#ffffff" },
  { key: "espresso", label: "Espresso", color: "linear-gradient(135deg, #573b2e, #271b16)", ink: "#ffffff" },
  { key: "aurora", label: "Aurora", color: "linear-gradient(135deg, #134e4a, #312e81)", ink: "#ffffff" },
  { key: "berry", label: "Berry", color: "linear-gradient(135deg, #831843, #4c1d95)", ink: "#ffffff" },
];

export function isBackgroundImage(value: string): boolean {
  return /^(https?:\/\/|data:image\/|\/api\/)/i.test(value);
}

/** Wallpaper never changes app text colors. Opaque theme surfaces keep text,
 * voice controls and nested cards readable on any photo or pattern. */
export function chatBubbleTheme(background: string | null): CSSProperties | undefined {
  if (!background || background === "default") return undefined;
  return {
    "--bubble-other-bg": "var(--surface-2)",
    "--chat-bubble-shadow": "0 2px 8px rgb(0 0 0 / 18%)",
  } as CSSProperties;
}
