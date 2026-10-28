# Maddy Signal WebAssembly bridge

This AGPL-3.0-only crate is a browser/WebView bridge around the official
[`signalapp/libsignal`](https://github.com/signalapp/libsignal) Rust protocol
implementation. It is intentionally built as a separate component so the
encryption boundary can be tested and audited independently of the Next.js
application.

Private keys and ratchet state are local-only. The application server receives
only public device identity and prekey records.

## Verified foundation, not a production protocol rollout

`src/protocol.rs` calls the pinned library's `process_prekey_bundle`,
`message_encrypt` and `message_decrypt`. It does not extract chain keys or
derive its own message cipher. Five native tests cover bidirectional restart,
out-of-order delivery, replay, signature/identity changes and tampering.
Private state is returned only on success. It includes the consumed-prekey
inventory and persistent PQ-prekey replay markers.

The caller must obtain explicit authenticated approval for the remote identity,
serialize all transitions for a local device, and atomically commit session and
private-prekey changes before releasing ciphertext, displaying plaintext or
acknowledging delivery. The adapter alone cannot enforce those application duties.
Old raw-chain and incomplete setup entry points fail closed.

Build and run (Rust 1.99.1; `protoc` on PATH or `PROTOC` set):

```sh
cargo test --locked --manifest-path signal-bridge/Cargo.toml
rustup target add wasm32-unknown-unknown
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path signal-bridge/Cargo.toml
```

Generate browser bindings with `wasm-bindgen-cli` 0.2.128, matching Cargo.lock.
Keep the existing registration assets unchanged; new bindings belong in
`public/signal/ratchet-v1/` and are loaded independently.

Production remains on the existing encrypted messaging path. The experimental
send route remains unavailable. Client transaction integration, authenticated
context binding, group membership changes, native background notifications,
history transfer, downgrade protection and compatibility testing must pass
before a protocol rollout. No independent cryptographic audit is claimed.

The crate and official libsignal dependency use AGPL-3.0. Prepare the complete
corresponding-source offer and licence notices for review before distribution;
keeping a repository private does not resolve distribution obligations.
