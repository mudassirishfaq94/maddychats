/**
 * Built-in SVG chat background patterns.
 * Each pattern returns a CSS `background` value using inline SVG data URIs.
 * The opacity parameter (0–1) controls the pattern visibility.
 *
 * Doodle styles can also be fully customized. A custom doodle style is a
 * compact config string stored in `background_style`:
 *
 *   doodle:<setIds>:<inkColor>:<baseColor>:<size>
 *
 * e.g. `doodle:cat,star,heart:#22d3ee:#101828:1.4`
 * (set ids "all" or "classic" select the whole built-in sets)
 */

export interface ChatPattern {
  id: string;
  label: string;
  /** Base background color shown behind the pattern */
  baseColor: string;
  /** Generate the full CSS background value with given opacity */
  background: (opacity: number) => string;
}

/* ---------- doodle stamp library ----------
 * Each stamp is a small path group drawn in a 100x100 cell.
 * Stamps are grouped into themed sets the user can mix.
 */

export interface DoodleStamp {
  id: string;
  /** SVG path data (or multiple sub-paths) drawn in a 100x100 box */
  paths: string[];
  /** Optional filled dots (cx, cy, r) for details like eyes */
  dots?: Array<[number, number, number]>;
}

export const DOODLE_SETS: Array<{ id: string; label: string; stamps: DoodleStamp[] }> = [
  {
    id: "classic",
    label: "Classic",
    stamps: [
      { id: "star", paths: ["M50 10 L56 34 L80 34 L60 48 L67 72 L50 58 L33 72 L40 48 L20 34 L44 34Z"] },
      { id: "heart", paths: ["M50 78 Q20 55 20 36 Q20 18 36 18 Q46 18 50 28 Q54 18 64 18 Q80 18 80 36 Q80 55 50 78Z"] },
      { id: "smiley", paths: ["M50 15 A35 35 0 1 1 49.9 15Z M35 42 L35 44 M65 42 L65 44"], dots: [[35, 42, 2.5], [65, 42, 2.5]] },
      { id: "moon", paths: ["M62 12 Q30 22 30 50 Q30 78 62 88 Q42 72 42 50 Q42 28 62 12Z"] },
      { id: "flower", paths: ["M50 30 Q58 20 66 30 Q74 38 64 44 Q74 50 66 58 Q58 68 50 58 Q42 68 34 58 Q26 50 36 44 Q26 38 34 30 Q42 20 50 30Z", "M50 58 L50 82"], dots: [[50, 44, 4]] },
    ],
  },
  {
    id: "creatures",
    label: "Creatures",
    stamps: [
      { id: "cat", paths: ["M25 55 L25 35 L37 45 Q50 40 63 45 L75 35 L75 55 Q80 70 65 76 L35 76 Q20 70 25 55Z", "M30 40 L28 30 L36 36", "M70 40 L72 30 L64 36"], dots: [[38, 55, 2], [62, 55, 2]] },
      { id: "ghost", paths: ["M50 15 Q28 15 28 42 L28 82 L36 72 L44 82 L50 73 L56 82 L64 72 L72 82 L72 42 Q72 15 50 15Z"], dots: [[42, 38, 2.5], [58, 38, 2.5]] },
      { id: "bunny", paths: ["M38 25 Q34 8 42 8 Q48 8 46 25", "M62 25 Q66 8 58 8 Q52 8 54 25", "M30 60 Q30 40 50 40 Q70 40 70 60 Q70 78 50 78 Q30 78 30 60Z"], dots: [[42, 55, 2], [58, 55, 2]] },
      { id: "fish", paths: ["M20 50 Q35 30 55 40 Q70 46 75 50 Q70 54 55 60 Q35 70 20 50Z", "M75 50 L90 38 L90 62Z"], dots: [[32, 46, 2]] },
      { id: "bird", paths: ["M30 55 Q30 35 50 35 Q70 35 70 55 L70 70 L60 70 L58 60 L42 60 L40 70 L30 70Z", "M50 35 L58 22 L64 28"], dots: [[58, 45, 2]] },
    ],
  },
  {
    id: "nature",
    label: "Nature",
    stamps: [
      { id: "tree", paths: ["M50 40 L30 70 L70 70Z", "M50 20 L38 40 L62 40Z", "M50 70 L50 88"] },
      { id: "leaf", paths: ["M25 75 Q25 35 75 25 Q65 65 25 75Z", "M25 75 L60 40"] },
      { id: "mountain", paths: ["M10 78 L38 30 L55 55 L65 40 L90 78Z"] },
      { id: "sun", paths: ["M50 35 A15 15 0 1 1 49.9 35Z", "M50 12 L50 20", "M50 80 L50 88", "M12 50 L20 50", "M80 50 L88 50", "M23 23 L29 29", "M71 71 L77 77", "M77 23 L71 29", "M29 71 L23 77"] },
      { id: "cloud", paths: ["M25 65 Q15 65 15 55 Q15 45 25 45 Q27 32 40 32 Q55 32 57 45 Q70 45 70 55 Q70 65 60 65Z"] },
    ],
  },
  {
    id: "playful",
    label: "Playful",
    stamps: [
      { id: "rocket", paths: ["M50 12 Q62 28 62 50 Q62 62 50 70 Q38 62 38 50 Q38 28 50 12Z", "M38 50 L24 62 L38 60", "M62 50 L76 62 L62 60", "M44 70 L42 84 L50 78 L58 84 L56 70"] },
      { id: "music", paths: ["M42 65 L42 22 L72 16 L72 58", "M42 65 A8 8 0 1 1 41.9 65Z", "M72 58 A8 8 0 1 1 71.9 58Z"] },
      { id: "ball", paths: ["M50 15 A35 35 0 1 1 49.9 15Z", "M50 15 Q35 50 50 85", "M50 15 Q65 50 50 85", "M15 50 L85 50"] },
      { id: "plane", paths: ["M20 55 L80 35 L62 62 L52 55Z", "M52 55 L50 75 L58 65"] },
      { id: "icecream", paths: ["M32 45 Q32 22 50 22 Q68 22 68 45Z", "M35 45 L50 85 L65 45"] },
    ],
  },
];

export const DOODLE_ALL_SETS = DOODLE_SETS.map((s) => s.id);

/** Get a stamp by "setId:stampId" or bare stamp id (searches all sets). */
export function getStampsForSets(setIds: string[]): DoodleStamp[] {
  const wanted = setIds.filter((id) => id !== "all");
  const sets = wanted.length === 0 ? DOODLE_SETS : DOODLE_SETS.filter((s) => wanted.includes(s.id));
  return sets.flatMap((s) => s.stamps);
}

/* ---------- custom doodle style encoding ---------- */

export interface DoodleStyle {
  setIds: string[];
  inkColor: string;
  baseColor: string;
  /** Size multiplier 0.5–2.5 applied to the tile base size */
  size: number;
}

const DEFAULT_DOODLE_STYLE: DoodleStyle = {
  setIds: ["all"],
  inkColor: "#ffffff",
  baseColor: "#1b2a38",
  size: 1,
};

export const DEFAULT_DOODLE_STYLE_STRING = encodeDoodleStyle(DEFAULT_DOODLE_STYLE);

function clampHexColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function encodeDoodleStyle(style: DoodleStyle): string {
  const sets = style.setIds.length === 0 || style.setIds.includes("all") ? "all" : style.setIds.join(",");
  return `doodle:${sets}:${style.inkColor}:${style.baseColor}:${style.size}`;
}

/** Parse a custom doodle style string; returns null for other/invalid values. */
export function parseDoodleStyle(value: string | null | undefined): DoodleStyle | null {
  if (!value || !value.startsWith("doodle:")) return null;
  const parts = value.split(":");
  if (parts.length !== 5) return null;
  const [, setsRaw, inkRaw, baseRaw, sizeRaw] = parts;
  const validSetIds = new Set([...DOODLE_ALL_SETS, "all"]);
  const setIds = setsRaw === "all" ? ["all"] : setsRaw.split(",").filter((id) => validSetIds.has(id));
  if (setsRaw !== "all" && setIds.length === 0) return null;
  const size = Number(sizeRaw);
  if (!Number.isFinite(size) || size < 0.5 || size > 2.5) return null;
  return {
    setIds,
    inkColor: clampHexColor(inkRaw, DEFAULT_DOODLE_STYLE.inkColor),
    baseColor: clampHexColor(baseRaw, DEFAULT_DOODLE_STYLE.baseColor),
    size,
  };
}

/** Encode a validated style back into the background_style string. */
export function encodeDoodleStyleString(style: DoodleStyle): string {
  return encodeDoodleStyle({
    setIds: style.setIds.includes("all") || style.setIds.length === 0 ? ["all"] : style.setIds,
    inkColor: clampHexColor(style.inkColor, DEFAULT_DOODLE_STYLE.inkColor),
    baseColor: clampHexColor(style.baseColor, DEFAULT_DOODLE_STYLE.baseColor),
    size: Math.min(2.5, Math.max(0.5, Math.round(style.size * 10) / 10)),
  });
}

const DOODLE_TILE_BASE = 170;

function hexToUrlColor(hex: string): string {
  return `%23${hex.replace("#", "")}`;
}

/** Build the repeating SVG background for a parsed doodle style at a given opacity. */
export function buildDoodleBackground(style: DoodleStyle, opacity: number): string {
  const stamps = getStampsForSets(style.setIds);
  const tile = Math.round(DOODLE_TILE_BASE * style.size);
  const cols = Math.max(2, Math.round(3 / style.size)); // keep roughly even density
  const rows = Math.max(2, Math.round(3 / style.size));
  const cell = tile / cols;
  const ink = hexToUrlColor(style.inkColor);
  const strokeW = Math.max(0.9, 1.4 / style.size).toFixed(2);

  let body = "";
  stamps.forEach((stamp, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = col * cell + cell / 2;
    const y = row * cell + cell / 2;
    const scale = (cell * 0.72) / 100;
    const paths = stamp.paths.map((d) => `<path d="${d}"/>`).join("");
    const dots = (stamp.dots ?? []).map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink}" stroke="none"/>`).join("");
    body += `<g transform="translate(${(x - 50 * scale).toFixed(1)} ${(y - 50 * scale).toFixed(1)}) scale(${scale.toFixed(3)})" fill="none" stroke="${ink}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round">${paths}${dots}</g>`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">${body}</svg>`;
  const esc = svg.replace(/#/g, "%23").replace(/"/g, "'");
  return `url("data:image/svg+xml,${esc}")`;
}

/* ---------- built-in preset patterns ---------- */

/* ---------- individual pattern generators ---------- */

function doodles(opacity: number): string {
  const o = Math.round(opacity * 255).toString(16).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <g fill="none" stroke="%23ffffff" stroke-width="1.2" opacity="${opacity}">
      <!-- cat -->
      <path d="M20 40 L25 25 L30 40 M22 32 Q25 36 28 32" />
      <!-- ghost -->
      <path d="M50 30 Q50 20 55 20 Q60 20 60 30 L60 42 L57 38 L54 42 L51 38 L48 42 L50 30Z" />
      <!-- star -->
      <path d="M90 25 L92 32 L99 32 L93 37 L95 44 L90 40 L85 44 L87 37 L81 32 L88 32Z" />
      <!-- heart -->
      <path d="M120 35 Q120 25 127 25 Q134 25 134 35 Q134 42 127 48 Q120 42 120 35Z" />
      <!-- moon -->
      <path d="M160 25 Q150 30 150 40 Q150 50 160 55 Q153 48 153 40 Q153 32 160 25Z" />
      <!-- flower -->
      <circle cx="30" cy="70" r="3" /><circle cx="24" cy="66" r="3" /><circle cx="36" cy="66" r="3" /><circle cx="24" cy="74" r="3" /><circle cx="36" cy="74" r="3" />
      <!-- lightning -->
      <path d="M65 60 L60 75 L67 72 L62 90" />
      <!-- music note -->
      <path d="M100 60 L100 80 Q100 85 95 85 Q90 85 90 80 Q90 75 95 75 Q100 75 100 60Z M100 60 L110 55 L110 75" />
      <!-- smiley -->
      <circle cx="150" cy="70" r="10" /><circle cx="146" cy="67" r="1.5" fill="%23ffffff" /><circle cx="154" cy="67" r="1.5" fill="%23ffffff" /><path d="M145 74 Q150 79 155 74" />
      <!-- umbrella -->
      <path d="M40 100 Q40 85 55 85 Q70 85 70 100 M55 85 L55 115 M48 115 Q55 118 62 115" />
      <!-- cloud -->
      <path d="M80 95 Q80 88 87 88 Q90 83 97 88 Q104 83 107 88 Q114 88 114 95Z" />
      <!-- diamond -->
      <path d="M140 90 L150 80 L160 90 L150 100Z" />
      <!-- spiral -->
      <path d="M180 95 Q185 90 185 95 Q185 102 178 102 Q170 102 170 94 Q170 85 180 85" />
      <!-- tree -->
      <path d="M30 120 L30 140 M20 140 L40 140 M30 120 L22 132 M30 120 L38 132 M30 125 L25 134 M30 125 L35 134" />
      <!-- arrow -->
      <path d="M70 120 L85 130 L70 140 M85 130 L60 130" />
      <!-- eye -->
      <path d="M105 120 Q115 110 125 120 Q115 130 105 120Z" /><circle cx="115" cy="120" r="3" fill="%23ffffff" />
      <!-- crown -->
      <path d="M145 120 L150 110 L155 120 L160 110 L165 120Z M145 120 L165 120 L165 128 L145 128Z" />
      <!-- boat -->
      <path d="M30 160 Q50 170 70 160 M50 160 L50 145 L65 152" />
      <!-- sun -->
      <circle cx="100" cy="155" r="6" /><line x1="100" y1="144" x2="100" y2="148" /><line x1="100" y1="162" x2="100" y2="166" /><line x1="89" y1="155" x2="93" y2="155" /><line x1="107" y1="155" x2="111" y2="155" />
      <!-- planet -->
      <circle cx="145" cy="155" r="6" /><ellipse cx="145" cy="155" rx="12" ry="3" />
      <!-- mushroom -->
      <path d="M175 160 Q175 148 165 148 Q155 148 155 160 L158 160 L158 170 L172 170 L172 160Z" />
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function dots(opacity: number): string {
  const o = Math.round(opacity * 255).toString(16).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="1.5" fill="%23ffffff" opacity="${opacity}" />
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function stripes(opacity: number): string {
  const o = Math.round(opacity * 255).toString(16).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <path d="M0 20 L20 0" stroke="%23ffffff" stroke-width="1" opacity="${opacity}" />
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function waves(opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20" viewBox="0 0 100 20">
    <path d="M0 10 Q25 0 50 10 Q75 20 100 10" fill="none" stroke="%23ffffff" stroke-width="1" opacity="${opacity}" />
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function grid(opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <path d="M0 40 L40 40 M40 0 L40 40" fill="none" stroke="%23ffffff" stroke-width="0.5" opacity="${opacity}" />
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function hexagons(opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="48" viewBox="0 0 56 48">
    <path d="M14 0 L28 8 L28 24 L14 32 L0 24 L0 8Z" fill="none" stroke="%23ffffff" stroke-width="0.6" opacity="${opacity}" transform="translate(14,8)" />
    <path d="M14 0 L28 8 L28 24 L14 32 L0 24 L0 8Z" fill="none" stroke="%23ffffff" stroke-width="0.6" opacity="${opacity}" transform="translate(42,8)" />
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function circuit(opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <g stroke="%23ffffff" stroke-width="0.7" fill="none" opacity="${opacity}">
      <path d="M10 0 L10 20 L30 20 L30 40 L50 40 L50 60" />
      <path d="M0 30 L20 30 L20 50 L40 50 L40 30 L60 30" />
      <circle cx="10" cy="20" r="2" fill="%23ffffff" />
      <circle cx="30" cy="20" r="2" fill="%23ffffff" />
      <circle cx="30" cy="40" r="2" fill="%23ffffff" />
      <circle cx="50" cy="40" r="2" fill="%23ffffff" />
      <circle cx="20" cy="30" r="2" fill="%23ffffff" />
      <circle cx="20" cy="50" r="2" fill="%23ffffff" />
      <circle cx="40" cy="50" r="2" fill="%23ffffff" />
      <circle cx="40" cy="30" r="2" fill="%23ffffff" />
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

function leaves(opacity: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <g fill="none" stroke="%23ffffff" stroke-width="0.8" opacity="${opacity}">
      <path d="M15 45 Q15 25 30 15 Q25 35 15 45Z" />
      <path d="M15 45 L22 30" />
      <path d="M45 15 Q45 35 30 45 Q35 25 45 15Z" />
      <path d="M45 15 L38 30" />
    </g>
  </svg>`;
  return `url("data:image/svg+xml,${svg}")`;
}

/* ---------- exported pattern list ---------- */

export const CHAT_PATTERNS: ChatPattern[] = [
  {
    id: "doodles",
    label: "Doodles",
    baseColor: "#1b2a38",
    background: doodles,
  },
  {
    id: "dots",
    label: "Dots",
    baseColor: "#1a1a2e",
    background: dots,
  },
  {
    id: "stripes",
    label: "Stripes",
    baseColor: "#1c1c2f",
    background: stripes,
  },
  {
    id: "waves",
    label: "Waves",
    baseColor: "#162447",
    background: waves,
  },
  {
    id: "grid",
    label: "Grid",
    baseColor: "#1a1a2e",
    background: grid,
  },
  {
    id: "hexagons",
    label: "Hexagons",
    baseColor: "#0f1a2e",
    background: hexagons,
  },
  {
    id: "circuit",
    label: "Circuit",
    baseColor: "#0d1b2a",
    background: circuit,
  },
  {
    id: "leaves",
    label: "Leaves",
    baseColor: "#1a2e1a",
    background: leaves,
  },
];

/** Check if a backgroundStyle value is a built-in pattern id */
/** Check if a backgroundStyle value is a built-in pattern id or a doodle:<...> style string */
export function isPatternId(value: string): boolean {
  if (value.startsWith("doodle:")) return parseDoodleStyle(value) !== null;
  return CHAT_PATTERNS.some((p) => p.id === value);
}

/** Get a pattern by id. Doodle:<...> style strings resolve to a synthetic pattern. */
export function getPattern(id: string): ChatPattern | undefined {
  const doodleStyle = parseDoodleStyle(id);
  if (doodleStyle) {
    return {
      id,
      label: "Doodles",
      baseColor: doodleStyle.baseColor,
      background: (opacity: number) => buildDoodleBackground(doodleStyle, opacity),
    };
  }
  return CHAT_PATTERNS.find((p) => p.id === id);
}
