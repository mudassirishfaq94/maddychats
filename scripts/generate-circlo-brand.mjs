import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import sharp from "sharp";

// Keep web, email, installed-app and legacy icon URLs on one approved geometry.
const mark = color => `<g fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"><path d="M53 15A25 25 0 1 0 46 54"/><path d="M46 40A25 25 0 1 1 43 78"/></g><g fill="${color}"><circle cx="32" cy="32" r="6.5"/><circle cx="64" cy="60" r="6.5"/></g>`;
const vector = color => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${mark(color)}</svg>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#000"/><g transform="translate(16 16)">${mark("#fff")}</g></svg>`;
await mkdir("public/brand", { recursive: true });
await writeFile("public/brand/circlo-dark.svg", vector("#fff"));
await writeFile("public/brand/circlo-light.svg", vector("#000"));
await writeFile("public/icons/circlo-mark.svg", icon);
await writeFile("public/icons/ziptalk.svg", icon);
for (const size of [192, 512]) {
  const bytes = await sharp(Buffer.from(icon)).resize(size, size).png().toBuffer();
  await writeFile(`public/icons/circlo-${size}.png`, bytes);
  await writeFile(`public/icons/ziptalk-${size}.png`, bytes);
}
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#000"/><g transform="translate(29 29) scale(0.73)">${mark("#fff")}</g></svg>`;
const masked = await sharp(Buffer.from(maskable)).resize(512, 512).png().toBuffer();
await writeFile("public/icons/circlo-maskable-512.png", masked);
await writeFile("public/icons/ziptalk-maskable-512.png", masked);
const email = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><g transform="translate(0 8) scale(0.83)">${mark("#fff")}</g><text x="100" y="64" fill="#fff" font-family="Arial,sans-serif" font-weight="700" font-size="60" letter-spacing="-2">circlo</text></svg>`;
await writeFile("public/brand/circlo-email.png", await sharp(Buffer.from(email)).png().toBuffer());
const png = await sharp(Buffer.from(icon)).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
await writeFile("src/app/favicon.ico", Buffer.concat([header, png]));
const offlinePath = "public/offline.html";
let offline = await readFile(offlinePath, "utf8");
offline = offline.replace(/<svg[^>]*data-circlo-offline[^]*?<\/svg>/, "");
offline = offline.replace("<body><main>", `<body><main><svg data-circlo-offline xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 96 96" role="img" aria-label="Circlo">${mark("#fff")}</svg>`);
offline = offline.replaceAll("#6255d8", "#151719").replaceAll("#0b1211", "#151719").replaceAll("#0f766e", "#C9A77B").replaceAll("#5eead4", "#C9A77B").replace("color:white;padding", "color:#17191D;padding");
await writeFile(offlinePath, offline);
// Update existing native artwork only; Android code/configuration stays independent.
const root = "android/app/src/main/res";
await writeFile(`${root}/drawable/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?><vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#000000" android:pathData="M0,0h108v108H0Z"/></vector>');
await writeFile(`${root}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#000000</color></resources>');
let colors = await readFile(`${root}/values/colors.xml`, "utf8");
colors = colors.replaceAll("#0f766e", "#151719").replaceAll("#0b1211", "#000000").replaceAll("#5eead4", "#C9A77B");
await writeFile(`${root}/values/colors.xml`, colors);
for (const directory of await readdir(root)) {
  if (!/^(mipmap-|drawable)/.test(directory)) continue;
  for (const file of await readdir(`${root}/${directory}`)) {
    if (!/^(ic_launcher(?:_foreground|_round)?|splash)\.png$/.test(file)) continue;
    const target = `${root}/${directory}/${file}`;
    const { width, height } = await sharp(target).metadata();
    const artwork = file === "splash.png" ? vector("#fff") : file.includes("foreground") ? maskable.replace('<rect width="128" height="128" fill="#000"/>', "") : icon;
    const side = file === "splash.png" ? Math.min(width, height, 256) : Math.min(width, height);
    const logo = await sharp(Buffer.from(artwork)).resize(side, side).png().toBuffer();
    const background = file.includes("foreground") ? { r: 0, g: 0, b: 0, alpha: 0 } : "#000";
    await sharp({ create: { width, height, channels: 4, background } }).composite([{ input: logo, gravity: "center" }]).png().toFile(target);
  }
}
console.log("Generated monochrome Circlo brand, email, favicon, PWA and existing Android artwork.");
