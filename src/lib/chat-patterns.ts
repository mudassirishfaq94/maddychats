/**
 * Built-in SVG chat background patterns.
 * Each pattern returns a CSS `background` value using inline SVG data URIs.
 * The opacity parameter (0–1) controls the pattern visibility.
 */

export interface ChatPattern {
  id: string;
  label: string;
  /** Base background color shown behind the pattern */
  baseColor: string;
  /** Generate the full CSS background value with given opacity */
  background: (opacity: number) => string;
}

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
export function isPatternId(value: string): boolean {
  return CHAT_PATTERNS.some((p) => p.id === value);
}

/** Get a pattern by id */
export function getPattern(id: string): ChatPattern | undefined {
  return CHAT_PATTERNS.find((p) => p.id === id);
}
