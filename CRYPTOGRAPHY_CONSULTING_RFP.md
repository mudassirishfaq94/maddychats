# Cryptographic design review request

Circlo seeks an independent review of its active private-messaging design and the migration needed for stronger sender authentication, signed device/key distribution, replay protection and ratcheting.

The current supported client encrypts private chat text and attachment content before upload using conversation keys. An experimental Signal bridge exists, but its send endpoint is quarantined and its presence is not evidence that ordinary chat messages use Signal. Start with [current coverage](docs/security/encryption-current.md), trace the actual send/decrypt/key-sharing paths and build the shipped artifacts.

Requested scope:

- Reproduce cross-message/cross-sender replay and key-share substitution against disposable running clients.
- Review device identity, approval, first-contact verification, recovery and revocation, including protection against an actively malicious server.
- Assess a migration using maintained protocol implementations rather than a custom ratchet, preserving existing history and account isolation.
- Review attachment context binding, metadata exposure, native/browser key storage and client-code delivery.
- Verify compiled WASM against its source and test real out-of-order delivery, replay, concurrent sends, restored sessions, group changes and compromised devices.
- Review legacy-data migration and privacy-safe operational logging.

Deliverables should include the exact source/artifact revisions, threat model, reproducible findings, tested fixes, unresolved limitations and rollout/rollback requirements. No numeric security score or certification should be inferred from this request.

Source distribution, dependency licensing and deployment permissions must be reviewed separately. This document is a request for professional work, not a completed audit.
