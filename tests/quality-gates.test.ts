import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOriginDestination } from "../src/lib/navigation";
import { reviewAudit, type AuditReport, type AuditException } from "../scripts/lib/dependency-audit";

test("full reloads preserve the deployment origin and reject redirect tricks", () => {
  const origin = "https://chat.example.com";
  assert.equal(sameOriginDestination("/login?mfa=1&next=%2Fapp", origin), `${origin}/login?mfa=1&next=%2Fapp`);
  for (const target of ["//evil.example/app", "/\\evil.example/app", "https://evil.example", "javascript:alert(1)"]) {
    assert.throws(() => sameOriginDestination(target, origin));
  }
});

const exception: AuditException = { package: "braces", version: "3.0.3", advisory: "GHSA-vfj7-8cjw-p6xm", expires: "2026-11-08T00:00:00Z", reason: "No upstream fix; developer tooling only" };
const fixture = (): AuditReport => ({ vulnerabilities: {
  braces: { name: "braces", severity: "high", nodes: ["node_modules/braces"], via: [{ url: `https://github.com/advisories/${exception.advisory}`, severity: "high" }] },
  lint: { name: "lint", severity: "high", nodes: ["node_modules/lint"], via: ["braces"] },
} });
const packages = { "node_modules/braces": { version: "3.0.3", dev: true }, "node_modules/lint": { version: "1.0.0", dev: true } };
const now = new Date("2026-10-09T00:00:00Z");
test("audit exceptions accept only the exact reviewed development dependency", () => {
  assert.deepEqual(reviewAudit(fixture(), packages, [exception], now).rejected, []);
  for (const changed of [
    { ...packages, "node_modules/braces": { version: "3.0.3", dev: false } },
    { ...packages, "node_modules/braces": { version: "3.0.4", dev: true } },
    { ...packages, "node_modules/lint": { version: "1.0.0", dev: false } },
  ]) assert(reviewAudit(fixture(), changed, [exception], now).rejected.length > 0);
  assert(reviewAudit(fixture(), { ...packages, "node_modules/braces": { version: "3.0.3", dev: false } }, [exception], now).rejected.includes("braces"));
  assert.equal(reviewAudit(fixture(), packages, [exception], new Date(exception.expires)).rejected.length, 2);
  const newAdvisory = fixture();
  newAdvisory.vulnerabilities!.braces.via.push({ url: "https://github.com/advisories/GHSA-new-advisory", severity: "high" });
  assert.equal(reviewAudit(newAdvisory, packages, [exception], now).rejected.length, 2);
  const critical = fixture(); critical.vulnerabilities!.lint.severity = "critical";
  assert.deepEqual(reviewAudit(critical, packages, [exception], now).rejected, ["lint"]);
  assert.throws(() => reviewAudit({ error: "offline" }, packages, [exception], now));
});
