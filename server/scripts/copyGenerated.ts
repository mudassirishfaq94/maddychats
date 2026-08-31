/**
 * Copy non-TypeScript assets from the generated Prisma client into the compiled
 * output directory. `tsc` only emits .js for .ts sources, so the WASM query
 * compiler and any binary assets Prisma generated must be copied over so the
 * production build (dist/) can load them at runtime.
 *
 * Usage: tsx scripts/copyGenerated.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

const srcDir = path.join(serverRoot, "src", "generated", "prisma");
const outDir = path.join(serverRoot, "dist", "generated", "prisma");

const COPY_EXTENSIONS = new Set([".wasm", ".node", ".json"]);

function copyAssets(from: string, to: string) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyAssets(src, dest);
    } else if (COPY_EXTENSIONS.has(path.extname(entry.name))) {
      fs.copyFileSync(src, dest);
    }
  }
}

copyAssets(srcDir, outDir);
console.log("✔ Copied generated Prisma assets to dist/.");
