import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
const mark = (await readFile("public/icons/circlo-mark.svg")).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#151719"/><circle cx="1100" cy="60" r="350" fill="none" stroke="#33313e" stroke-width="55"/><image href="data:image/svg+xml;base64,${mark}" x="80" y="65" width="100" height="100"/></svg>`;
const layers = [];
for (const [text, size, left, top, color] of [["circlo", 54, 200, 90, "#f4f3f5"], ["Your circle.", 72, 80, 230, "#f4f3f5"], ["Your secrets. Sealed.", 72, 80, 320, "#f4f3f5"], ["Private messaging with end-to-end encryption", 30, 84, 480, "#c1bdce"], ["circlo.chat", 24, 84, 540, "#c1bdce"]]) {
  const input = await sharp({ text: { text: `<span foreground="${color}">${text}</span>`, font: `Geist ${size}`, fontfile: path.resolve("node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"), rgba: true } }).png().toBuffer();
  layers.push({ input, left, top });
}
await sharp(Buffer.from(svg)).composite(layers).png().toFile("public/brand/social-card.png");
