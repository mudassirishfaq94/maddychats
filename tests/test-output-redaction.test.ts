import { test } from "node:test";
import assert from "node:assert/strict";
import { redactTestOutput } from "../scripts/redact-test-output";
test("browser failure diagnostics omit headers and embedded session values", () => {
  const result = redactTestOutput('GET /api/auth/me\n - cookie: maddy_session=fixture-secret; maddy_refresh=fixture-refresh\n - authorization: Bearer fixture-access\ninline maddy_refresh=fixture-inline\nError: HTTP 503');
  for (const secret of ["fixture-secret", "fixture-refresh", "fixture-access", "fixture-inline"]) assert(!result.includes(secret));
  assert(result.includes("GET /api/auth/me") && result.includes("HTTP 503"));
});
