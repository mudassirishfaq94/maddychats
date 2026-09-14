import "client-only";
import { SignalLocalStore } from "./e2ee-signal-store";

const SESSION_NAMESPACE = "signal-session-v2";
const PREKEY_NAMESPACE = "signal-private-prekeys-v2";

/** Stable storage address for one local-device / remote-device ratchet. */
export function signalSessionAddress(remoteUserId: string, remoteDeviceId: string): string {
  return `${remoteUserId}:${remoteDeviceId}`;
}

/**
 * Persist serialized official-libsignal state. Callers must save updated bytes
 * before acknowledging a received envelope or considering an outgoing envelope
 * sent; that ordering makes restart/retry safe.
 */
export class SignalSessionState {
  private constructor(
    private readonly store: SignalLocalStore,
    private readonly userId: string,
    private readonly deviceId: string,
  ) {}

  static async open(userId: string, deviceId: string): Promise<SignalSessionState> {
    return new SignalSessionState(await SignalLocalStore.open(), userId, deviceId);
  }

  loadSession(remoteUserId: string, remoteDeviceId: string): Promise<Uint8Array | null> {
    return this.store.loadBytes(`${SESSION_NAMESPACE}:${signalSessionAddress(remoteUserId, remoteDeviceId)}`, this.userId, this.deviceId);
  }

  saveSession(remoteUserId: string, remoteDeviceId: string, serializedRecord: Uint8Array): Promise<void> {
    return this.store.saveBytes(`${SESSION_NAMESPACE}:${signalSessionAddress(remoteUserId, remoteDeviceId)}`, this.userId, this.deviceId, serializedRecord);
  }

  loadPrivatePrekeys(): Promise<Uint8Array | null> {
    return this.store.loadBytes(PREKEY_NAMESPACE, this.userId, this.deviceId);
  }

  savePrivatePrekeys(serializedRecords: Uint8Array): Promise<void> {
    return this.store.saveBytes(PREKEY_NAMESPACE, this.userId, this.deviceId, serializedRecords);
  }

  /**
   * Ratchet transitions may consume a prekey and advance a session together.
   * Persist both encrypted records atomically before a mailbox ACK is sent.
   */
  async commitInbound(
    remoteUserId: string,
    remoteDeviceId: string,
    serializedSession: Uint8Array,
    serializedPrekeys: Uint8Array,
  ): Promise<void> {
    if (serializedSession.byteLength === 0 || serializedPrekeys.byteLength === 0) {
      throw new Error("signal_state_empty_serialization");
    }
    await this.store.saveMany([
      { namespace: `${SESSION_NAMESPACE}:${signalSessionAddress(remoteUserId, remoteDeviceId)}`, userId: this.userId, deviceId: this.deviceId, bytes: serializedSession },
      { namespace: PREKEY_NAMESPACE, userId: this.userId, deviceId: this.deviceId, bytes: serializedPrekeys },
    ]);
  }

  close(): void { this.store.close(); }
}
