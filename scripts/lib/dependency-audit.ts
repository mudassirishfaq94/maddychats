export interface Finding {
  name: string;
  severity: string;
  via: (string | { url: string; severity: string })[];
  nodes: string[];
}
export interface AuditReport {
  vulnerabilities?: Record<string, Finding>;
  error?: unknown;
}
export interface AuditException {
  package: string;
  version: string;
  advisory: string;
  expires: string;
  reason: string;
}
type LockPackages = Record<string, { version?: string; dev?: boolean }>;

/** Fail closed on unknown findings; exceptions apply only to exact dev-only leaves. */
export function reviewAudit(report: AuditReport, packages: LockPackages, exceptions: AuditException[], now = new Date()) {
  if (report.error || !report.vulnerabilities) throw new Error("Dependency audit did not return a valid report.");
  const findings = report.vulnerabilities;
  const accepted: string[] = [], rejected: string[] = [];
  function covered(name: string, visiting = new Set<string>()): boolean {
    const finding = findings[name];
    if (!finding || finding.severity === "critical" || visiting.has(name) || !finding.nodes.length || !finding.via.length) return false;
    if (!finding.nodes.every((node) => packages[node]?.dev === true)) return false;
    const next = new Set(visiting).add(name);
    return finding.via.every((cause) => {
      if (typeof cause === "string") return covered(cause, next);
      return exceptions.some((exception) =>
        exception.package === name && cause.url === `https://github.com/advisories/${exception.advisory}` &&
        finding.severity === "high" && cause.severity === "high" &&
        Number.isFinite(Date.parse(exception.expires)) && now.getTime() < Date.parse(exception.expires) &&
        exception.reason.length > 0 && finding.nodes.every((node) => packages[node].version === exception.version),
      );
    });
  }
  for (const [name, finding] of Object.entries(findings)) {
    if (!["high", "critical"].includes(finding.severity)) continue;
    (covered(name) ? accepted : rejected).push(name);
  }
  return { accepted, rejected };
}
