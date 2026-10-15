/** Formatting assistance only: never evidence of phone ownership. */
export const callingCodes = [["+92","Pakistan"],["+971","United Arab Emirates"],["+91","India"],["+880","Bangladesh"],["+966","Saudi Arabia"],["+44","United Kingdom"],["+1","United States / Canada"],["+61","Australia"],["+33","France"],["+49","Germany"]] as const;

export function discoveryPhone(value: string, countryCode = ""): string | null {
  let number = value.trim().replace(/[\s()\-]/g, "");
  if (number.startsWith("00")) number = "+" + number.slice(2);
  if (!number.startsWith("+") && /^\d+$/.test(number) && callingCodes.some(([code]) => code === countryCode)) {
    number = countryCode + number.replace(/^0+/, "");
  }
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}
