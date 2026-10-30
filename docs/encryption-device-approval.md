# Encryption device approval

> Historical flow description. Current recovery choices and production protocol coverage are summarized in [Current encryption coverage](security/encryption-current.md). Some UI labels and linking steps below describe an older release.

An encryption device is an account's browser keypair. A phone or laptop is not
inherently trusted: different accounts and browser profiles have different keys.
Clearing storage can remove the private key needed to authorize another device.

Profile → Encryption devices lists the current fingerprint, pending devices,
trusted key IDs, available browser information and session status. Older keys
without session metadata are labelled explicitly; their physical device cannot
be inferred from a device ID. A trusted record alone does not prove that its
private key remains accessible. The original browser must complete a private-key
challenge. Trust permits key sharing; chat history still needs its original keys.

## Normal linking

1. On the new browser, sign into the same account and request device linking.
2. On the original browser marked Trusted, refresh Encryption devices.
3. Compare the new browser's fingerprint, enter its linking code, check the
   comparison box and approve the encryption device.
4. On a trusted browser that can read the chat, open that chat and use
   Restore my other devices. Reopen the chat on the approved browser.

Pending browsers show instructions instead of unusable approval controls.
Approval, rejection, expiry, revocation and proof replay are enforced server-side.

## When no trusted browser is accessible

Choose I cannot access a trusted device. Read the history warning, confirm your
identity and type RESET ENCRYPTION TRUST. A sign-in within five minutes satisfies
fresh authentication; otherwise a password and the enabled second factor are
required. Google/phone users can sign in again through the existing login flow.

Recovery is explicit account enrollment, separate from trusted-device approval.
It verifies possession of the pending browser's private key and its active
authenticated session using a short-lived, single-use challenge. In one
transaction it signs out other browsers, removes older encryption trust, trusts only the proven browser
and revokes pending linking requests. Authentication and MFA remain enabled.

Recovery does not delete messages, replace conversation keys, or decrypt lost
history. An existing participant who retains the keys must verify the changed
identity and send an encrypted reply. Alternatively, re-approve an original
browser with its keys intact and restore from that browser. If nobody retains
the keys, the old messages remain unreadable; new conversations can still start.

Only an account's first ever key can bootstrap trust during registration.
Historical or revoked key records require explicit recovery even when no
trusted key remains. First registrations are serialized per account.

## Verification

The production browser integration suite runs normal approval and recovery on
disposable accounts. It checks actual controls, challenge/proof responses,
persisted trust, encrypted delivery, history preservation, wrong credentials,
MFA, stale sessions, account isolation, replay, and zero-trusted-key enrollment.
Tests respect rate limits and never change real users' keys or authentication.
