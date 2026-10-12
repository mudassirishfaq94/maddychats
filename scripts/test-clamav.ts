import assert from "node:assert/strict";
import { scanUpload } from "../src/server/upload-safety";

async function main() {
  assert(process.env.CLAMAV_HOST, "Set CLAMAV_HOST to an isolated scanner");
  await scanUpload(Buffer.from("Harmless scanner connectivity check"));
  // Standard harmless EICAR test signature, constructed only in memory.
  const signature = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}", "$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");
  await assert.rejects(scanUpload(Buffer.from(signature)), /failed the safety scan/);
  console.log("Real ClamAV accepted clean bytes and rejected the standard test signature");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
