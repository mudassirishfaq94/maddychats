import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const names = ["hello", "love", "laugh", "celebrate", "yes", "busy"];
await mkdir("public/stickers", { recursive: true }); await mkdir("public/gifs", { recursive: true });
for (const name of names) {
  const frames = [];
  for (let frame = 0; frame < 12; frame++) {
    const t = frame / 12 * Math.PI * 2, bounce = Math.sin(t) * 6;
    let detail = '<circle cx="72" cy="82" r="5"/><circle cx="120" cy="82" r="5"/><path d="M68 108Q96 134 124 108" fill="none" stroke="#242329" stroke-width="7" stroke-linecap="round"/>';
    if (name === "love") detail = '<path d="M58 75C48 55 82 53 84 72C91 51 124 55 114 76L86 105Z" fill="#B9667A"/><path d="M72 117Q96 132 120 117" fill="none" stroke="#242329" stroke-width="6" stroke-linecap="round"/>';
    if (name === "laugh") detail = '<path d="M61 85L75 75L86 86M106 86L117 75L132 85" fill="none" stroke="#242329" stroke-width="6" stroke-linecap="round"/><path d="M67 108Q96 159 126 108Z"/><ellipse cx="96" cy="123" rx="12" ry="6" fill="#B9667A"/>';
    if (name === "yes") detail = '<path d="M61 98L85 121L134 69" fill="none" stroke="#34564A" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>';
    if (name === "busy") detail = '<circle cx="74" cy="82" r="5"/><circle cx="120" cy="82" r="5"/><path d="M82 116h28" stroke="#242329" stroke-width="6" stroke-linecap="round"/>';
    const extra = name === "hello" ? `<g transform="rotate(${Math.sin(t) * 18} 144 100)"><path d="M143 128V92M151 94V74M143 94V69M135 94V76M127 94V83" stroke="#F0C38E" stroke-width="9" stroke-linecap="round"/><ellipse cx="140" cy="107" rx="19" ry="23" fill="#F0C38E"/></g>` : name === "celebrate" ? Array.from({ length: 9 }, (_, i) => `<rect x="${22 + i * 18}" y="${18 + ((frame * 7 + i * 17) % 140)}" width="6" height="12" rx="2" fill="${["#B9667A", "#8CAED0", "#8DB5A2"][i % 3]}"/>`).join("") : name === "busy" ? `<g opacity="${0.4 + frame / 20}" fill="#C9A77B"><circle cx="78" cy="29" r="4"/><circle cx="96" cy="29" r="4"/><circle cx="114" cy="29" r="4"/></g>` : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><g transform="translate(0 ${bounce})"><circle cx="96" cy="98" r="62" fill="#C9A77B"/><g fill="#242329">${detail}</g></g>${extra}</svg>`;
    frames.push(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
  }
  const image = () => sharp(Buffer.concat(frames), { raw: { width: 192, height: 192 * 12, channels: 4, pageHeight: 192 } });
  await writeFile(`public/stickers/circlo-${name}-v1.webp`, await image().webp({ quality: 80, loop: 0, delay: Array(12).fill(100) }).toBuffer());
  await writeFile(`public/gifs/circlo-${name}-v1.gif`, await image().gif({ colours: 64, loop: 0, delay: Array(12).fill(100) }).toBuffer());
  await writeFile(`public/stickers/circlo-${name}-v1.png`, await sharp(frames[0], { raw: { width: 192, height: 192, channels: 4 } }).png().toBuffer());
}
console.log("Generated six original animated WebP stickers and GIFs.");
