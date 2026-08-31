/**
 * Prisma client generator (offline-friendly).
 *
 * This project uses Prisma's queryCompiler (pure-WASM) engine together with the
 * `pg` driver adapter, so NO native Prisma engine binary is needed at runtime.
 *
 * However, the Prisma CLI's `generate` step still insists on having engine
 * binaries "available" and tries to download them from binaries.prisma.sh. In a
 * restricted/offline environment that host is unreachable.
 *
 * The download is skipped when a matching binary already exists in Prisma's
 * local cache with a valid `.sha256` sidecar (see @prisma/fetch-engine's
 * `binaryNeedsToBeDownloaded`). We therefore seed the cache with placeholder
 * files + correct checksums. Crucially we do NOT set PRISMA_QUERY_ENGINE_LIBRARY
 * (which would force `engineType: "library"`); with the cache seeded, generation
 * keeps `engineType: "client"` and produces the WASM queryCompiler client that
 * never loads these placeholders at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fetchEngine = require("@prisma/fetch-engine");
const { getBinaryTargetForCurrentPlatform, getNodeAPIName } = require(
  "@prisma/get-platform"
);
const { enginesVersion } = require("@prisma/engines-version");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

function sha256(file: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function seedPlaceholder(dir: string, name: string) {
  fs.mkdirSync(dir, { recursive: true });
  const binPath = path.join(dir, name);
  if (!fs.existsSync(binPath)) {
    fs.writeFileSync(
      binPath,
      "// Placeholder Prisma engine.\n" +
        "// This project runs the pure-WASM queryCompiler at runtime; this native\n" +
        "// engine binary is never loaded. It exists only so the offline Prisma CLI\n" +
        "// skips downloading engines from binaries.prisma.sh.\n"
    );
  }
  // Write the checksum sidecar so the fetcher treats the cache entry as valid.
  fs.writeFileSync(`${binPath}.sha256`, sha256(binPath));
}

async function seedCache() {
  const target = await getBinaryTargetForCurrentPlatform();
  const cacheDir: string | null = await fetchEngine.getCacheDir(
    "master",
    enginesVersion,
    target
  );
  if (!cacheDir) {
    throw new Error("Could not resolve Prisma cache directory.");
  }
  seedPlaceholder(cacheDir, `schema-engine-${target}`);
  seedPlaceholder(cacheDir, getNodeAPIName(target, "fs"));
  return cacheDir;
}

async function main() {
  const cacheDir = await seedCache();
  console.log(`• Seeded offline Prisma engine cache at ${cacheDir}`);

  const result = spawnSync(
    "npx",
    [
      "prisma",
      "generate",
      "--schema",
      path.join(serverRoot, "prisma", "schema.prisma"),
    ],
    {
      stdio: "inherit",
      cwd: serverRoot,
      env: {
        ...process.env,
        PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: "1",
        // Force the pure-WASM "client" (queryCompiler) engine. Without this the
        // generator defaults to "library" and emits a client that tries to load
        // a native libquery engine binary at runtime.
        PRISMA_CLIENT_ENGINE_TYPE: "client",
      },
    }
  );

  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error("Prisma generate failed:", err);
  process.exit(1);
});
