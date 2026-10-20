export const POLICY_VERSION = "2026-10-14";
export type PolicyConsent = { acceptTerms: boolean; acceptPrivacy: boolean };
export function acceptsPolicies(value: unknown): value is PolicyConsent {
  if (!value || typeof value !== "object") return false;
  const fields = value as Record<string, unknown>;
  return fields.acceptTerms === true && fields.acceptPrivacy === true;
}
export function policyAcceptance(value: unknown) {
  if (!acceptsPolicies(value)) return null;
  const now = new Date();
  return { termsAcceptedAt: now, privacyAcceptedAt: now, policyVersion: POLICY_VERSION };
}
