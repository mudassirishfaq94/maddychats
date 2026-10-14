import assert from "node:assert/strict";
import test from "node:test";
import { acceptsPolicies, policyAcceptance, POLICY_VERSION } from "../src/lib/policy-consent";
import { registerSchema } from "../src/lib/schemas";
test("signup requires two explicit boolean acceptances and persists their version", () => {
  const base = { displayName: "Consent fixture", username: "consent_fixture", email: "consent@example.invalid", password: "StrongPassword91", confirmPassword: "StrongPassword91" };
  assert.equal(registerSchema.safeParse(base).success, false);
  for (const invalid of [null, {}, { acceptTerms: true }, { acceptTerms: "true", acceptPrivacy: true }, { acceptTerms: true, acceptPrivacy: false }]) assert.equal(acceptsPolicies(invalid), false);
  assert.equal(registerSchema.safeParse({ ...base, acceptTerms: true, acceptPrivacy: true }).success, true);
  const record = policyAcceptance({ acceptTerms: true, acceptPrivacy: true })!;
  assert.equal(record.policyVersion, POLICY_VERSION); assert(record.termsAcceptedAt instanceof Date && record.privacyAcceptedAt instanceof Date);
});
