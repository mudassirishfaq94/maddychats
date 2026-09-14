//! Browser bridge for the official Signal protocol implementation.
//!
//! This crate intentionally exposes no message transport or server access.
//! It only creates client-side cryptographic material; persistence and network
//! delivery remain in the TypeScript application layer.

#![forbid(unsafe_code)]

use libsignal_protocol::IdentityKeyPair;
use rand::rng;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IdentityBundle {
    /// Serialized private identity key pair. It must remain encrypted on the
    /// device and must never be sent to the application server.
    private_identity: Vec<u8>,
    /// Serialized public identity key for the device/prekey directory.
    public_identity: Vec<u8>,
}

/// Version of the protocol envelope understood by this bridge.
#[wasm_bindgen]
pub fn protocol_version() -> u32 {
    2
}

/// Create a new Signal identity key pair entirely in the client runtime.
///
/// The returned private bytes are for a future encrypted local key store only.
/// This function is deliberately separate from device registration so callers
/// cannot accidentally upload private key material.
#[wasm_bindgen]
pub fn generate_identity() -> Result<JsValue, JsValue> {
    let identity = IdentityKeyPair::generate(&mut rng());
    let bundle = IdentityBundle {
        private_identity: identity.serialize().into_vec(),
        public_identity: identity.identity_key().serialize().to_vec(),
    };
    serde_wasm_bindgen::to_value(&bundle)
        .map_err(|error| JsValue::from_str(&format!("identity serialization failed: {error}")))
}
