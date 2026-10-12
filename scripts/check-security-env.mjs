/** Run in the server environment. Output variable names and states only. */
import "dotenv/config";

export function reviewSecurityEnvironment(env) {
  const issues = [];
  const check = (name, ok, detail) => { if (!ok) issues.push({ name, detail }); };
  check("NODE_ENV", env.NODE_ENV === "production", "Expected production mode on a deployed server.");
  for (const name of ["JWT_SECRET", "CRON_SECRET", "HEALTHCHECK_SECRET"]) {
    check(name, typeof env[name] === "string" && env[name].length >= 32 && !/replace-with|your-secret|changeme/i.test(env[name]),
      "Use a unique random secret of at least 32 characters.");
  }
  let origin;
  try { origin = new URL(env.CLIENT_URL); } catch { /* invalid is reported below */ }
  check("CLIENT_URL", origin?.protocol === "https:" && !origin.username && !origin.password &&
    origin.pathname === "/" && !origin.search && !origin.hash, "Use the exact public HTTPS origin.");
  check("CSP_ENFORCE", env.CSP_ENFORCE === "1", "Enforce the nonce-based policy after browser verification.");
  check("LOGIN_PERFORMANCE_DIAGNOSTICS", env.LOGIN_PERFORMANCE_DIAGNOSTICS !== "1", "Disable deployment diagnostics.");
  check("PROFILE_BUILD", env.PROFILE_BUILD !== "1", "Disable production profiling in public releases.");
  for (const name of Object.keys(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /(SECRET|PRIVATE|SERVICE_ROLE|DATABASE_URL|RESEND|PASSWORD)/.test(name)) {
      issues.push({ name, detail: "Confidential credentials must never be published in browser variables." });
    }
  }
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { /* invalid */ }
  check("DATABASE_URL", database && ["postgres:", "postgresql:"].includes(database.protocol), "Configure a valid server-only database URL.");
  if (database && !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)) {
    check("DATABASE_URL TLS", !["disable", "no-verify", "allow", "prefer"].includes(database.searchParams.get("sslmode")),
      "Do not permit disabled or unverified TLS for a remote database. Verify the driver's effective TLS settings.");
  }
  const has = name => typeof env[name] === "string" && Boolean(env[name].trim());
  for (const name of ["RESEND_API_KEY", "EMAIL_FROM"]) check(name, has(name), "Required for branded verification and recovery email.");
  if (has("SUPABASE_URL") !== has("SUPABASE_SERVICE_ROLE_KEY")) issues.push({ name: "SUPABASE storage", detail: "Configure both server-only values together; verify the bucket is private in Supabase." });
  return issues;
}

if (process.argv[1]?.endsWith("check-security-env.mjs")) {
  const issues = reviewSecurityEnvironment(process.env);
  console.log(JSON.stringify({ status: issues.length ? "needs_review" : "configuration_checks_passed", issues,
    limitations: ["Does not test credential validity, provider key restrictions, database grants, or bucket privacy."] }, null, 2));
  process.exitCode = issues.length ? 1 : 0;
}
