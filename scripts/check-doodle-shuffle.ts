import { randomDoodleStyle, parseDoodleStyle, encodeDoodleStyleString, buildDoodleBackground, DOODLE_ALL_SETS } from "../src/lib/chat-patterns";

const styles = Array.from({ length: 200 }, () => randomDoodleStyle());
let ok = true;

function check(name: string, cond: boolean) {
  if (!cond) ok = false;
  console.log(`${cond ? "ok" : "FAIL"}: ${name}`);
}

// 1. Every shuffled style round-trips through the real parser (valid shape).
check("all 200 styles parse validly", styles.every((s) => parseDoodleStyle(encodeDoodleStyleString(s)) !== null));

// 2. Sets are always valid ids or "all".
check("set ids valid", styles.every((s) => s.setIds.every((id) => id === "all" || DOODLE_ALL_SETS.includes(id))));

// 3. Ink colors are valid hex and light enough for contrast on a dark base.
check("ink hex valid", styles.every((s) => /^#[0-9a-f]{6}$/.test(s.inkColor)));
const lum = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
check("ink is light (contrast on dark bases)", styles.every((s) => lum(s.inkColor) > 0.3));

// 4. Bases are always from the curated dark list (same palette as presets).
const bases = new Set(styles.map((s) => s.baseColor));
const CURATED = new Set(["#1b2a38", "#101828", "#3b0764", "#134e4a", "#431407", "#4c1d95", "#0c334b", "#463625", "#0f172a", "#0e3b20", "#581c87", "#7c2d12"]);
check("bases are curated darks only", [...bases].every((b) => CURATED.has(b)));

// 5. Sizes stay in the comfortable 0.7–1.6 band and actually vary.
const sizes = new Set(styles.map((s) => s.size));
check("sizes in 0.7-1.6", styles.every((s) => s.size >= 0.7 && s.size <= 1.6));
check("sizes vary (>=5 distinct)", sizes.size >= 5);

// 6. Style actually varies across draws (not a fixed pick).
const inks = new Set(styles.map((s) => s.inkColor));
check("ink variety (>=50 distinct of 200)", inks.size >= 50);
check("set combos vary (>=4 distinct)", new Set(styles.map((s) => s.setIds.join(","))).size >= 4);

// 7. Background builder accepts every style.
check("bg builds for all", styles.every((s) => buildDoodleBackground(s, 1).startsWith("url(\"data:image/svg")));

console.log(ok ? "\nALL SHUFFLE CHECKS PASSED" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
