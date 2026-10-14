import { createECDH } from "node:crypto";

/** Read the public key at runtime so adding push configuration needs no client rebuild. */
export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"];
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  try {
    const key = createECDH("prime256v1");
    key.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (key.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch { return null; }
}
