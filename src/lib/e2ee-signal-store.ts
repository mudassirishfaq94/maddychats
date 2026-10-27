import "client-only";

/**
 * Encrypted client-only storage for Signal identity and session state.
 *
 * All private protocol material is AES-256-GCM encrypted before IndexedDB
 * persistence. The encryption key is a non-extractable Web Crypto key
 * generated per-origin and never sent to the server.
 *
 * Signal records are encrypted with Web Crypto and an unextractable AES key
 * held in IndexedDB. This store does not use the native keystore; device
 * identity material is handled separately by device-key-storage.ts.
 */

const DATABASE = "maddy-signal-v2";
const STORE = "records";
const MASTER_KEY_ID = "master-key";

type StoredRecord = { id: string; value: CryptoKey | EncryptedValue };
type EncryptedValue = { iv: ArrayBuffer; ciphertext: ArrayBuffer; format?: 2 };

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

async function readRecord(db: IDBDatabase, id: string): Promise<StoredRecord | undefined> {
  const transaction = db.transaction(STORE, "readonly");
  return requestResult(transaction.objectStore(STORE).get(id) as IDBRequest<StoredRecord | undefined>);
}

async function masterKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await readRecord(db, MASTER_KEY_ID);
  if (existing?.value instanceof CryptoKey) return existing.value;
  if (existing !== undefined) throw new Error("signal_store_master_key_invalid");
  // Web Crypto must finish outside the IDB transaction. Recheck inside a
  // read/write transaction so another tab's committed key always wins.
  const candidate = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const records = transaction.objectStore(STORE);
    const request = records.get(MASTER_KEY_ID) as IDBRequest<StoredRecord | undefined>;
    let selected: CryptoKey;
    request.onsuccess = () => {
      if (request.result === undefined) {
        selected = candidate;
        records.add({ id: MASTER_KEY_ID, value: candidate });
      } else if (request.result.value instanceof CryptoKey) {
        selected = request.result.value;
      } else {
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(selected);
    transaction.onabort = () => reject(transaction.error ?? new Error("signal_store_master_key_unavailable"));
    transaction.onerror = () => reject(transaction.error ?? new Error("signal_store_master_key_failed"));
  });
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
      const id = recordId(namespace, userId, deviceId);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) }, key, plaintext);
      return { id, value: { iv: iv.buffer, ciphertext, format: 2 } } satisfies StoredRecord;
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
    const id = recordId(namespace, userId, deviceId);
    const record = await readRecord(this.db, id);
    if (record === undefined) return null;
    const value = record.value as EncryptedValue;
    if (!value || !(value.iv instanceof ArrayBuffer) || !(value.ciphertext instanceof ArrayBuffer)) throw new Error("signal_store_record_invalid");
    if (value.format !== undefined && value.format !== 2) throw new Error("signal_store_format_unavailable");
    const key = await masterKey(this.db);
    // Existing unversioned records remain readable. New records authenticate
    // their account/device/namespace address as well as their encrypted bytes.
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv,
      ...(value.format === 2 ? { additionalData: new TextEncoder().encode(id) } : {}),
    }, key, value.ciphertext);
    return new Uint8Array(plaintext);
  }

  async remove(namespace: string, userId: string, deviceId: string): Promise<void> {
    const transaction = this.db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(recordId(namespace, userId, deviceId));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("signal_store_remove_aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("signal_store_remove_failed"));
    });
  }

  close(): void { this.db.close(); }
}
