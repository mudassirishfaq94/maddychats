import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

// Temporary, narrowly scoped fix for GHSA-vfj7-8cjw-p6xm. Refuse unknown
// package contents so an upstream change cannot silently skip the protection.
const require = createRequire(import.meta.url);
let root;
try { root = path.dirname(require.resolve("braces/package.json")); }
catch (error) {
  if (error.code === "MODULE_NOT_FOUND" && (process.env.NODE_ENV === "production" || process.env.npm_config_omit?.split(/\s+/).includes("dev"))) process.exit(0);
  throw error;
}
if (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version !== "3.0.3") throw new Error("Review braces recursion hardening for the new package version.");
const originals = {
  compile: "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f",
  expand: "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7",
  stringify: "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a",
};
const patched = {
  compile: "c8e9820bad7ea633968baf35d56345c0ec9c831a1658557dcb83fc5e9d129b0b",
  expand: "1e0f2e3e768f30fcf37941524cc4bb963c242d42ce1392b9478d12870bfb33e3",
  stringify: "038337ea4d00499c26a09c0c17a3f6bda16e391206265706162e2aa3dc9712c7",
};
const digest = text => createHash("sha256").update(text).digest("hex");
for (const [name, original] of Object.entries(originals)) {
  const file = path.join(root, "lib", name + ".js");
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (patched[name] && digest(source) === patched[name]) continue;
  if (digest(source) !== original) throw new Error(`Unknown braces ${name} source; review the security patch before installation.`);
  const walker = name === "stringify" ? "stringify" : "walk";
  let next = source.replace(`const ${walker} = (node, parent = {}) => {`, `const ${walker} = (node, parent = {}, depth = 0) => {\n    if (depth > 64) throw new RangeError('Brace nesting exceeds the security depth limit');`);
  next = name === "stringify" ? next.replace("stringify(child)", "stringify(child, {}, depth + 1)") : next.replace("walk(child, node)", "walk(child, node, depth + 1)");
  if (next === source || !next.includes("depth + 1")) throw new Error("Braces security patch could not be applied.");
  if (digest(next) !== patched[name]) throw new Error("Braces security patch output did not match its reviewed checksum.");
  fs.writeFileSync(file, next);
}
console.log("Braces recursive AST walkers bounded to 64 levels (development tooling only).");
