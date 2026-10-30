import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const result = await build({ entryPoints: ["src/lib/startup-chat-reader.ts"], bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", minify: true });
const output = result.outputFiles[0].text;
if (process.argv.includes("--check")) assert.equal(await readFile("public/startup-reader.js", "utf8"), output, "Rebuild the packaged startup reader from its reviewed source");
else await writeFile("public/startup-reader.js", output);
