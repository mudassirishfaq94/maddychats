"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required for Firebase client initialization.`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: required(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    "NEXT_PUBLIC_FIREBASE_API_KEY",
  ),
  authDomain: required(
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  ),
  projectId: required(
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  ),
  storageBucket: required(
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  ),
  messagingSenderId: required(
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  ),
  appId: required(
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ),
};

/** Reuses the existing app during Fast Refresh instead of initializing twice. */
export const firebaseApp: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const firebaseAuth: Auth = getAuth(firebaseApp);
