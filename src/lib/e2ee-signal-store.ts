import "client-only";

/**
 * Encrypted client-only storage for Signal identity and session state.
 *
 * All private protocol material is AES-256-GCM encrypted before IndexedDB
 * persistence. The encryption key is a non-extractable Web Crypto key
 * generated per-origin and never sent to the server.
 *
 * **IMPLEMENTED:**
 * - AES-256-GCM encryption of all stored records
 * - Atomic multi-record writes for crash safety
 * - Non-extractable master key (cannot be exported via JS)
 * - Android uses Capacitor SecureStorage (Android Keystore-backed)
 *   via createHardwareKeyStorage() in e2ee-hardware-storage.ts
 *
 * **REMAINING BEFORE PRODUCTION:**
 * - Desktop browsers: master key derived from login passphrase
 *   (via e2ee-hardware-storage.ts DesktopKeyStorage)
 * - Formal security review
 */

const DATABASE = "maddy-signal-v2";
const STORE = "records";
const MASTER_KEY_ID = "master-key";

type StoredRecord = { id: string; value: CryptoKey | EncryptedValue };
type EncryptedValue = { iv: ArrayBuffer; ciphertext: ArrayBuffer };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("signal_store_open_failed"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("signal_store_request_failed"));
  });
}

async function readRecord<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  const transaction = db.transaction(STORE, "readonly");
  const record = await requestResult(transaction.objectStore(STORE).get(id) as IDBRequest<StoredRecord | undefined>);
  return record?.value as T | undefined;
}

async function writeRecord(db: IDBDatabase, record: StoredRecord): Promise<void> {
  const transaction = db.transaction(STORE, "readwrite");
  await requestResult(transaction.objectStore(STORE).put(record));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("signal_store_write_aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("signal_store_write_failed"));
  });
}

async function masterKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await readRecord<CryptoKey>(db, MASTER_KEY_ID);
  if (existing instanceof CryptoKey) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await writeRecord(db, { id: MASTER_KEY_ID, value: key });
  return key;
}

function recordId(namespace: string, userId: string, deviceId: string): string {
  return `${namespace}:${userId}:${deviceId}`;
}

export class SignalLocalStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<SignalLocalStore> {
    if (typeof indexedDB === "undefined") throw new Error("signal_store_unavailable");
    return new SignalLocalStore(await openDatabase());
  }

  async saveBytes(namespace: string, userId: string, deviceId: string, bytes: Uint8Array): Promise<void> {
    await this.saveMany([{ namespace, userId, deviceId, bytes }]);
  }

  /** Commit related ratchet records in one IndexedDB transaction. */
  async saveMany(records: Array<{ namespace: string; userId: string; deviceId: string; bytes: Uint8Array }>): Promise<void> {
    if (records.length === 0) return;
    const key = await masterKey(this.db);
    const encrypted = await Promise.all(records.map(async ({ namespace, userId, deviceId, bytes }) => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
      return { id: recordId(namespace, userId, deviceId), value: { iv: iv.buffer, ciphertext } } satisfies StoredRecord;
    }));
    const transaction = this.db.transaction(STORE, "readwrite");
    for (const record of encrypted) transaction.objectStore(STORE).put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("signal_store_write_aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("signal_store_write_failed"));
    });
  }

  async loadBytes(namespace: string, userId: string, deviceId: string): Promise<Uint8Array | null> {
    const value = await readRecord<EncryptedValue>(this.db, recordId(namespace, userId, deviceId));
    if (!value || !(value.iv instanceof ArrayBuffer) || !(value.ciphertext instanceof ArrayBuffer)) return null;
    const key = await masterKey(this.db);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv }, key, value.ciphertext);
    return new Uint8Array(plaintext);
  }

  async remove(namespace: string, userId: string, deviceId: string): Promise<void> {
    const transaction = this.db.transaction(STORE, "readwrite");
    await requestResult(transaction.objectStore(STORE).delete(recordId(namespace, userId, deviceId)));
  }

  close(): void { this.db.close(); }
}
