import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function firebaseAdminApp() {
  if (getApps().length) return getApp();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase Admin is not configured.");
  return initializeApp({ projectId });
}

export interface FirebasePhoneIdentity {
  uid: string;
  phoneNumber: string;
}

/**
 * Firebase Admin verifies the ID token signature, issuer, audience and expiry.
 * Only verified phone-provider claims are allowed into Maddy's session flow.
 */
export async function verifyFirebasePhoneToken(idToken: string): Promise<FirebasePhoneIdentity> {
  const decoded = await getAuth(firebaseAdminApp()).verifyIdToken(idToken);
  if (
    !decoded.uid ||
    !decoded.phone_number ||
    decoded.firebase.sign_in_provider !== "phone"
  ) {
    throw new Error("A verified Firebase phone identity is required.");
  }
  return { uid: decoded.uid, phoneNumber: decoded.phone_number };
}
