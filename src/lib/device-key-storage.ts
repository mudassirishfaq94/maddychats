import "client-only";
import { Capacitor } from "@capacitor/core";

const nativePrefix = "circlo-e2ee-v1";
let prefixReady: Promise<void> | undefined;

async function nativeStorage() {
  const { SecureStorage } = await import("@aparajita/capacitor-secure-storage");
  prefixReady ??= SecureStorage.setKeyPrefix(nativePrefix);
  await prefixReady;
  return SecureStorage;
}

/**
 * Keep the device identity secret and encrypted private-key envelope in OS
 * protected storage on native builds. Browser builds retain their existing
 * origin storage. Native writes fail closed; plugin's web fallback is unused.
 */
export async function readDeviceKeyMaterial(key: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
  const storage = await nativeStorage();
  const stored = await storage.get(key);
  if (typeof stored === "string") {
    if (localStorage.getItem(key) === stored) localStorage.removeItem(key);
    return stored;
  }

  const legacy = localStorage.getItem(key);
  if (legacy === null) return null;
  await storage.set(key, legacy);
  if (await storage.get(key) !== legacy) throw new Error("This device could not protect its saved chat access. Your existing copy is still on this device.");
  localStorage.removeItem(key);
  return legacy;
}

export async function writeDeviceKeyMaterial(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(key, value);
    return;
  }
  const storage = await nativeStorage();
  await storage.set(key, value);
  if (await storage.get(key) !== value) throw new Error("This device could not confirm protected chat access. Your existing saved copy was kept.");
  localStorage.removeItem(key);
}

export async function removeDeviceKeyMaterial(key: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const storage = await nativeStorage();
    await storage.remove(key);
  }
  localStorage.removeItem(key);
}
