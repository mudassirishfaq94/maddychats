/** Server-only Firebase Admin initialization shared by Firebase integrations. */
let firebaseAdmin: any = null;

export async function getFirebaseAdmin(): Promise<any | null> {
  if (firebaseAdmin) return firebaseAdmin;
  try {
    const admin: any = await import("firebase-admin");
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (!projectId || !clientEmail || !privateKey) return null;
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
    }
    firebaseAdmin = admin;
    return admin;
  } catch (error) {
    console.error("[firebase] Admin initialization failed:", error);
    return null;
  }
}
