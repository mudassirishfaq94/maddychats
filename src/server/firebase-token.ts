import { createRemoteJWKSet, jwtVerify } from "jose";

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface FirebasePhoneIdentity {
  uid: string;
  phoneNumber: string;
}

/** Verifies Firebase's RS256 ID token before it can enter Maddy's session flow. */
export async function verifyFirebasePhoneToken(idToken: string): Promise<FirebasePhoneIdentity> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase token verification is not configured.");

  const { payload } = await jwtVerify(idToken, firebaseKeys, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  const firebase = payload.firebase as { sign_in_provider?: unknown } | undefined;
  if (
    !payload.sub ||
    payload.sub.length > 128 ||
    typeof payload.phone_number !== "string" ||
    firebase?.sign_in_provider !== "phone"
  ) {
    throw new Error("A verified Firebase phone identity is required.");
  }
  return { uid: payload.sub, phoneNumber: payload.phone_number };
}
