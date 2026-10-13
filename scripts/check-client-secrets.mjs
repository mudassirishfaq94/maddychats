import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const canaries = ["circlo-audit-resend-canary-20261013", "circlo-audit-google-canary-20261013", "circlo-audit-jwt-canary-at-least-thirty-two-chars"];
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await scan(path);
    else {
      const bytes = await readFile(path);
      if (canaries.some(value => bytes.includes(Buffer.from(value)))) throw new Error("Server credential canary found in browser output: " + path);
      if (path.endsWith(".js.map")) throw new Error("Application browser source map exposed: " + path);
    }
  }
}
await scan(".next/static");
console.log("Browser output contains no injected server credential canaries or application JS source maps.");
