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
type EncryptedValue = { iv: ArrayBuffer; ciphertext: ArrayBuffer; format?: 2 | 3; version?: number; deleted?: boolean };
type Address = { namespace: string; userId: string; deviceId: string };
export type SignalStoreSnapshot = { version: number; bytes: Uint8Array | null };
export type SignalStoreMutation = Address & { expectedVersion: number; bytes: Uint8Array | null };

/** All handlers precede writes; synchronous quota/clone errors abort earlier puts too. */
function mutate(db: IDBDatabase, action: (store: IDBObjectStore, abort: (error: unknown) => void) => void, requireDurability = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite", { durability: "strict" });
    let failure: unknown;
    const abort = (error: unknown) => {
      failure ??= error;
      try { transaction.abort(); } catch { reject(failure); }
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("signal_store_write_aborted"));
    transaction.onerror = () => reject(failure ?? transaction.error ?? new Error("signal_store_write_failed"));
    if (requireDurability && transaction.durability !== "strict") {
      abort(new Error("signal_store_durable_transactions_unavailable"));
      return;
    }
    try { action(transaction.objectStore(STORE), abort); } catch (error) { abort(error); }
  });
}

function recordVersion(record: StoredRecord | undefined): number {
  if (record === undefined) return 0;
  const value = record.value as EncryptedValue;
  if (!value || !(value.iv instanceof ArrayBuffer) || !(value.ciphertext instanceof ArrayBuffer)) throw new Error("signal_store_record_invalid");
  if (value.format === 3) {
    if (!Number.isSafeInteger(value.version) || value.version! <= 0 || typeof value.deleted !== "boolean") throw new Error("signal_store_record_invalid");
    return value.version!;
  }
  if (value.format !== undefined && value.format !== 2 || value.version !== undefined || value.deleted !== undefined) throw new Error("signal_store_format_unavailable");
  return 0;
}

function authenticatedAddress(id: string, value: EncryptedValue): Uint8Array<ArrayBuffer> | undefined {
  if (value.format === 3) return new TextEncoder().encode(JSON.stringify([id, value.version, value.deleted]));
  return value.format === 2 ? new TextEncoder().encode(id) : undefined;
}

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
    const transaction = db.transaction(STORE, "readwrite", { durability: "strict" });
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
    await mutate(this.db, (store, abort) => {
      let remaining = encrypted.length;
      for (const record of encrypted) {
        const request = store.get(record.id) as IDBRequest<StoredRecord | undefined>;
        request.onsuccess = () => {
          try {
            if ((request.result?.value as EncryptedValue | undefined)?.format === 3) throw new Error("signal_store_versioned_write_required");
            if (--remaining === 0) for (const next of encrypted) store.put(next);
          } catch (error) { abort(error); }
        };
      }
    });
  }

  async loadBytes(namespace: string, userId: string, deviceId: string): Promise<Uint8Array | null> {
    return (await this.loadSnapshot(namespace, userId, deviceId)).bytes;
  }

  async loadSnapshot(namespace: string, userId: string, deviceId: string): Promise<SignalStoreSnapshot> {
    const id = recordId(namespace, userId, deviceId);
    const record = await readRecord(this.db, id);
    if (record === undefined) return { version: 0, bytes: null };
    const version = recordVersion(record);
    const value = record.value as EncryptedValue;
    const key = await masterKey(this.db);
    // Existing unversioned records remain readable. New records authenticate
    // their account/device/namespace address as well as their encrypted bytes.
    const additionalData = authenticatedAddress(id, value);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: value.iv,
      ...(additionalData ? { additionalData } : {}),
    }, key, value.ciphertext);
    return { version, bytes: value.deleted ? null : new Uint8Array(plaintext) };
  }

  /** Atomic compare-and-swap for ratchets, shared prekeys, outbox and receipts. */
  async compareAndSwap(records: SignalStoreMutation[]): Promise<void> {
    if (!records.length) return;
    const addresses = records.map(record => recordId(record.namespace, record.userId, record.deviceId));
    if (new Set(addresses).size !== records.length || records.some(record => record.userId !== records[0].userId || record.deviceId !== records[0].deviceId
      || !Number.isSafeInteger(record.expectedVersion) || record.expectedVersion < 0 || record.expectedVersion >= Number.MAX_SAFE_INTEGER)) {
      throw new Error("signal_store_invalid_transition");
    }
    const key = await masterKey(this.db);
    const encrypted = await Promise.all(records.map(async (record, index) => {
      const id = addresses[index];
      const value: EncryptedValue = { format: 3, version: record.expectedVersion + 1, deleted: record.bytes === null,
        iv: crypto.getRandomValues(new Uint8Array(12)).buffer, ciphertext: new ArrayBuffer(0) };
      const bytes = record.bytes;
      const plaintext = bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer : new ArrayBuffer(0);
      value.ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: value.iv, additionalData: authenticatedAddress(id, value) }, key, plaintext);
      return { id, value } satisfies StoredRecord;
    }));
    await mutate(this.db, (store, abort) => {
      let remaining = encrypted.length;
      for (let index = 0; index < encrypted.length; index++) {
        const request = store.get(encrypted[index].id) as IDBRequest<StoredRecord | undefined>;
        request.onsuccess = () => {
          try {
            if (recordVersion(request.result) !== records[index].expectedVersion) throw new Error("signal_store_state_conflict");
            if (--remaining === 0) for (const next of encrypted) store.put(next);
          } catch (error) { abort(error); }
        };
      }
    }, true);
  }

  async remove(namespace: string, userId: string, deviceId: string): Promise<void> {
    await mutate(this.db, (store, abort) => {
      const id = recordId(namespace, userId, deviceId);
      const request = store.get(id) as IDBRequest<StoredRecord | undefined>;
      request.onsuccess = () => {
        try {
          if ((request.result?.value as EncryptedValue | undefined)?.format === 3) throw new Error("signal_store_versioned_write_required");
          store.delete(id);
        } catch (error) { abort(error); }
      };
    });
  }

  close(): void { this.db.close(); }
}
