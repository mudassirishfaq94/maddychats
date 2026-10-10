# First-contact message requests

A new direct conversation permits one encrypted text introduction from its
creator. The recipient sees an approval prompt and an in-app message request
notification, with browser push when enabled. Replies and further introductions
are blocked on the server until the recipient accepts. Muted conversations and
disabled notification preferences remain respected. No read receipt is sent
before acceptance. Attachments and scheduled messages require acceptance.

Concurrent sends use a transaction-scoped conversation lock; only one succeeds.
An introduction and its notification commit together. Retrying its client message
ID returns the same message without another notification. Established chats keep
their existing fast path without this extra transaction.

If the recipient has not registered a trusted encryption device, the introduction
is queued as ciphertext with a recovery copy wrapped to the sender's trusted
device. The server never receives the plaintext or an unwrapped conversation key.
The recipient sees a waiting-for-secure-delivery placeholder until a trusted
sender device shares the existing key. Reconciliation runs when the recipient
registers a first trusted device or the sender reconnects anywhere in the app.
An offline sender must reconnect for this delivery to finish. Clearing all sender
keys still requires the existing trusted-device recovery flow; no replacement
key is generated during reconciliation. Changes to previously pinned peer keys
continue to require explicit verification.

Validation covers server consent, concurrent introductions, idempotent retries,
durable notification, pre-approval read suppression, attachments and scheduling,
and real browser encryption with offline sender recovery, acceptance and reply.
