import "client-only";

export type SignalEnvelope = {
  id: string;
  messageId: string;
  /** Authenticated account half of the sender's Signal ProtocolAddress. */
  senderUserId: string;
  senderDeviceId: string;
  recipientDeviceId: string;
  protocolVersion: number;
  ciphertext: string;
  createdAt: string;
};

/** Implemented by the WASM session layer after it decrypts and commits its
 * updated ratchet state to SignalLocalStore. */
export type SignalEnvelopeProcessor = (envelope: SignalEnvelope) => Promise<void>;

/**
 * Pull and process a device mailbox. An envelope is acknowledged only after
 * the processor completes; failures intentionally remain on the server for a
 * safe retry when session state/prekeys become available.
 */
export async function processSignalMailbox(
  deviceId: string,
  processEnvelope: SignalEnvelopeProcessor,
): Promise<{ processed: number; deferred: number }> {
  const response = await fetch(`/api/e2ee/signal/mailbox?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("signal_mailbox_fetch_failed");
  const data = await response.json() as { envelopes?: SignalEnvelope[] };
  const envelopes = Array.isArray(data.envelopes) ? data.envelopes : [];
  const acknowledged: string[] = [];
  for (const envelope of envelopes) {
    try {
      await processEnvelope(envelope);
      acknowledged.push(envelope.id);
    } catch {
      // Fail closed: preserving ciphertext for retry is safer than reporting
      // a permanent decrypt error after a transient local-state failure.
    }
  }
  if (acknowledged.length) {
    const acknowledgement = await fetch("/api/e2ee/signal/mailbox", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, envelopeIds: acknowledged }),
    });
    if (!acknowledgement.ok) throw new Error("signal_mailbox_ack_failed");
  }
  return { processed: acknowledged.length, deferred: envelopes.length - acknowledged.length };
}
