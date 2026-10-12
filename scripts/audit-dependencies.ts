import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { reviewAudit, type AuditException, type AuditReport } from "./lib/dependency-audit";

async function main() {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Use npm run audit:dependencies.");
  const child = spawn(process.execPath, [npm, "audit", "--json", "--fetch-retries=1", "--fetch-timeout=30000"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let output = "", errors = "";
  child.stdout.on("data", (chunk) => output += chunk);
  child.stderr.on("data", (chunk) => errors += chunk);
  const timer = setTimeout(() => child.kill(), 65000);
  let code;
  try { [code] = await once(child, "exit"); } finally { clearTimeout(timer); }
  if (code !== 0 && code !== 1) throw new Error(`Dependency audit failed: ${errors || "registry unavailable or timeout"}`);
  const report: AuditReport = JSON.parse(output);
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const exceptions: AuditException[] = JSON.parse(await readFile("dependency-audit-exceptions.json", "utf8"));
  const reviewed = reviewAudit(report, lock.packages, exceptions);
  for (const name of reviewed.accepted) console.warn(`Reviewed development-only advisory: ${name} (see dependency-audit-exceptions.json)`);
  if (reviewed.rejected.length) throw new Error(`Unresolved high/critical dependency findings: ${reviewed.rejected.join(", ")}`);
  console.log("Dependency audit passed: no unreviewed high/critical findings.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Dependency audit failed"); process.exitCode = 1; });
