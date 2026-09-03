import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

function firebaseAdminApp() {
  if (getApps().length) return getApp();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin is not configured.");
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

export interface VerifiedFirebaseIdentity {
  uid: string;
  phoneNumber: string | null;
  decodedToken: DecodedIdToken;
}

/**
 * Firebase Admin verifies the ID token signature, issuer, audience and expiry.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseIdentity> {
  const decodedToken = await getAuth(firebaseAdminApp()).verifyIdToken(idToken);
  return {
    uid: decodedToken.uid,
    phoneNumber: decodedToken.phone_number ?? null,
    decodedToken,
  };
}
