"use client";
import Link from "next/link";
import type { PolicyConsent } from "@/lib/policy-consent";
export function PolicyAgreement({ value, onChange }: { value: PolicyConsent; onChange: (value: PolicyConsent) => void }) {
  return <fieldset className="space-y-3 text-sm">
    <legend className="mb-2 font-semibold">Before you create an account</legend>
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={value.acceptTerms} onChange={event => onChange({ ...value, acceptTerms: event.target.checked })} /><span>I agree to the <Link className="underline" href="/terms" target="_blank" rel="noopener">Terms and Conditions</Link>.</span></label>
    <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={value.acceptPrivacy} onChange={event => onChange({ ...value, acceptPrivacy: event.target.checked })} /><span>I agree to the <Link className="underline" href="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.</span></label>
  </fieldset>;
}
