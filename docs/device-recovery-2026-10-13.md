# Circlo device continuity

`https://circlo.chat` is the canonical app origin. The release combines the
production security branch with the device-identity changes previously merged
only to main. Both migration histories are retained in chronological order.

## User flows

- Old Render `/app` navigation opens `/device-migration`. This page exports
  local encryption material without requiring an unexpired old-site login.
  Other public navigation and Google initiation move to the canonical origin.
- Profile identifies the browser/OS, trust status, activity and session state.
  Device labels and country are editable only from the bound browser session.
  Country is user-provided or an existing observation, never proof of trust.
  No new geolocation service, external IP disclosure, or paid service is added.
- A trusted browser generates a short-lived code for a specific pending key.
  Redemption must match that key's fingerprint and browser session. Codes
  remain single-use, rate-limited, account-bound and revocation-aware.
- Keep the source profile open during linking. It polls while an issued code
  is live and wraps available keys for up to 100 recent member conversations.
  No new conversation key is manufactured during synchronization. The UI
  reports incomplete restoration; older chats retain manual restoration.
- Re-signing in proves possession of the existing private key and rebinds its
  session. Ordinary logout revokes only the current modern session, including
  copied tokens. Explicit revocation and emergency reset retain their scope.
- Download an encrypted recovery file and keep its separately generated
  256-bit code in a password manager. Files use AES-256-GCM with a versioned
  authenticated context. Import verifies the account, keypair consistency,
  bounded content and the registered public key before one atomic local write.
  The server receives neither the file key nor the decrypted private key.
  Import preserves the registered trust decision; revoked keys stay revoked.
- Emergency reset remains behind explicit identity confirmation and the
  existing confirmation phrase. It is for loss of all trusted devices and
  recovery files, not a normal linking action.

## Scope and limits

The file contains this browser's RSA encryption identity and locally wrapped
conversation keys. It does not contain messages, media, drafts, or Signal
ratchet state. It cannot recover keys that were already lost. Restoring the
same identity is intended to replace an old browser; keep the old browser
data until message access is checked. Re-approval is still required if that
identity was explicitly revoked. Possession of both file and code exposes
the contained keys; store them separately.

## Verification

Regression coverage includes encrypted file round-trip, wrong account, wrong
code, ciphertext tampering, mismatched RSA keys, unrelated storage entries,
canonical routing, mobile UI labeling/country, code replay and wrong-session
redemption, ordinary logout isolation, re-login trust persistence and recovery
without revoking another browser. The existing integration suite checks
encrypted delivery, approval proof, emergency recovery, MFA, history preservation,
revocation and cross-account denial. CI gates the production rollout.
