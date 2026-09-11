"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/** Firebase's public web configuration is safe to ship to the browser. */
function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function firebasePhoneAuth(): Auth {
  const config = firebaseConfig();
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Phone sign-in has not been configured yet.");
  }
  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export function firebasePhoneAuthConfigured(): boolean {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}
