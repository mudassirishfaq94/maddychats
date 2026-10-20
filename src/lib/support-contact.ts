/** Explicitly configured public contact, never inferred from admin credentials. */
export function publicSupportEmail(value: string | undefined): string | null {
  if (!value || value.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value) || /\s|[\r\n]/.test(value) || /@(example\.(com|org|net|invalid)|.*\.invalid)$/i.test(value)) return null;
  return value;
}
