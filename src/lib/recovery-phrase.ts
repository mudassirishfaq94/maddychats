import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** New recovery codes are 24 familiar words representing 256 random bits. */
export function recoveryPhraseFromEntropy(entropy: Uint8Array): string {
  if (entropy.length !== 32) throw new Error("Recovery phrase entropy must be 32 bytes.");
  return entropyToMnemonic(entropy, wordlist);
}

/** Accept the new phrase and the previous base64 format during migration. */
export function recoveryPhraseToEntropy(value: string): Uint8Array {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (normalized.split(" ").length === 24) return mnemonicToEntropy(normalized, wordlist);
  const base64 = trimmed.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("Enter the 24-word recovery phrase or an older recovery code.");
  return bytes;
}
