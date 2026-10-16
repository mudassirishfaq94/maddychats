import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/** Server-only provider initialization; never sends a message or logs credentials. */
export function nativeFirebaseMessaging(configuration: { projectId: string; clientEmail: string; privateKey: string }) {
  const name = "circlo-native-push";
  const existing = getApps().find(app => app.name === name);
  if (existing && existing.options.projectId !== configuration.projectId) throw new Error("Firebase project mismatch");
  const app = existing ?? initializeApp({
    projectId: configuration.projectId,
    credential: cert({ ...configuration, privateKey: configuration.privateKey.replace(/\\n/g, "\n") }),
  }, name);
  return getMessaging(app);
}
