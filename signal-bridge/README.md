# Experimental registration bridge

This crate wraps the pinned official libsignal implementation for five registration and serialization operations: protocol version, identity generation, device/prekey generation, one-time prekey generation, and session-record canonicalization.

It does not export message encryption/decryption, chain keys, a custom X3DH handshake or a message ratchet. Ordinary Circlo chat sending does not use this module, and the experimental Signal send route remains quarantined. The removed TypeScript/Rust prototype code is available in Git history, not as an alternate production protocol.

Build and test with the locked dependency revision. The toolchain needs Rust, protoc, the wasm32-unknown-unknown target and the exact wasm-bindgen CLI version resolved in Cargo.lock (currently 0.2.128). The Cargo.toml requirement is a compatible version range, not the resolved CLI version. Browser entropy configuration lives in .cargo/config.toml. Run cargo test --locked before rebuilding the release WASM with cargo build --locked --release --target wasm32-unknown-unknown. Generate web-target glue using the matching wasm-bindgen tool, then run the artifact consistency check before updating public/signal files.

The crate is AGPL-3.0-only. Review licence, corresponding-source and distribution obligations before serving or distributing the bridge. Existence of this component or passing its tests is not an independent audit, production Signal support or proof of ratcheting in Circlo chats.
