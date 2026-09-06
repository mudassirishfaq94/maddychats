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

/** Opaque, coordinated bubbles preserve contrast even on busy photographs. */
export function chatBubbleTheme(background: string | null): CSSProperties | undefined {
  if (!background || background === "default") return undefined;
  const resolved = CHAT_BACKGROUNDS.find((p) => p.key === background)?.color ?? background;
  const hex = !isBackgroundImage(resolved) ? resolved.match(/#([a-f0-9]{6}|[a-f0-9]{3})(?![a-f0-9])/i)?.[1] : undefined;
  let hue = 215;
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta) hue = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360;
  }
  return {
    "--bubble-other-bg": `hsl(${hue} 30% 97%)`,
    "--bubble-own-bg": `hsl(${hue} 48% 23%)`,
    "--bubble-own-fg": "#ffffff",
    "--bubble-own-sub": `hsl(${hue} 25% 85%)`,
    "--text": `hsl(${hue} 35% 12%)`,
    "--muted": `hsl(${hue} 18% 33%)`,
    "--surface": `hsl(${hue} 30% 97%)`,
    "--surface-2": `hsl(${hue} 25% 91%)`,
    "--border": `hsl(${hue} 15% 75%)`,
    "--accent-fg": `hsl(${hue} 55% 27%)`,
    color: `hsl(${hue} 35% 12%)`,
  } as CSSProperties;
}
