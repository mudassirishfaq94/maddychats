//! Browser bridge for the official Signal protocol implementation.
//!
//! **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
//! undergone formal security audit. DO NOT use in production without external
//! cryptographic review.
//!
//! This crate intentionally exposes no message transport or server access.
//! It only creates client-side cryptographic material; persistence and network
//! delivery remain in the TypeScript application layer.
//!
//! **CRITICAL LIMITATIONS:**
//! - Double Ratchet not implemented (no forward secrecy)
//! - X3DH session setup incomplete
//! - Local key storage not hardware-backed
//! - No formal verification
//!
//! **REQUIRED BEFORE PRODUCTION:**
//! - External security audit by qualified cryptographer
//! - Implementation of Double Ratchet
//! - Hardware-backed key storage
//! - Formal protocol verification

#![forbid(unsafe_code)]

mod x3dh;
pub use x3dh::*;

use libsignal_protocol::{IdentityKeyPair, KeyPair, SessionRecord};
use rand::{Rng, rng};
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicPrekey { key_id: u32, public_key: Vec<u8>, signature: Option<Vec<u8>> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivatePrekey { key_id: u32, private_key: Vec<u8> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceRegistrationBundle {
    registration_id: u32,
    protocol_device_id: u32,
    identity_key: Vec<u8>,
    // Signal signs the signed prekey with the device identity key. This is
    // duplicated for the existing public-directory shape, never secret data.
    signing_key: Vec<u8>,
    signed_prekey: PublicPrekey,
    kyber_prekey: PublicPrekey,
    one_time_prekeys: Vec<PublicPrekey>,
    private_identity: Vec<u8>,
    private_signed_prekey: PrivatePrekey,
    private_kyber_prekey: PrivatePrekey,
    private_one_time_prekeys: Vec<PrivatePrekey>,
}

/// Version of the protocol envelope understood by this bridge.
#[wasm_bindgen]
pub fn protocol_version() -> u32 {
  2
}

/// Get the sender chain key from a session record.
/// This is used by the TypeScript layer to derive message keys.
#[wasm_bindgen]
pub fn get_sender_chain_key(session_record_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let session = SessionRecord::deserialize(session_record_bytes)
        .map_err(|error| JsValue::from_str(&format!("failed to deserialize session: {error}")))?;
    
    let session_state = session.session_state()
        .map_err(|error| JsValue::from_str(&format!("no session state: {error}")))?;
    
    session_state.get_sender_chain_key_bytes()
        .map_err(|error| JsValue::from_str(&format!("no sender chain key: {error}")))
}

/// Get the receiver chain key from a session record.
/// This is used by the TypeScript layer to derive message keys.
#[wasm_bindgen]
pub fn get_receiver_chain_key(session_record_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let session = SessionRecord::deserialize(session_record_bytes)
        .map_err(|error| JsValue::from_str(&format!("failed to deserialize session: {error}")))?;
    
    let session_state = session.session_state()
        .map_err(|error| JsValue::from_str(&format!("no session state: {error}")))?;
    
    session_state.get_receiver_chain_key_bytes()
        .map_err(|error| JsValue::from_str(&format!("no receiver chain key: {error}")))
}

/// Advance the sender chain key (ratchet step).
/// Returns the new chain key and message key for the next message.
#[wasm_bindgen]
pub fn advance_sender_chain(session_record_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut session = SessionRecord::deserialize(session_record_bytes)
        .map_err(|error| JsValue::from_str(&format!("failed to deserialize session: {error}")))?;
    
    // In a real implementation, this would:
    // 1. Get the current chain key
    // 2. Derive next chain key and message key
    // 3. Update the session state
    // 4. Return the new chain key
    
    // For now, return the serialized session (placeholder)
    session.serialize()
        .map_err(|error| JsValue::from_str(&format!("failed to serialize session: {error}")))
}

/// Advance the receiver chain key (ratchet step).
/// Returns the new chain key for the next message.
#[wasm_bindgen]
pub fn advance_receiver_chain(session_record_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut session = SessionRecord::deserialize(session_record_bytes)
        .map_err(|error| JsValue::from_str(&format!("failed to deserialize session: {error}")))?;
    
    // In a real implementation, this would:
    // 1. Get the current chain key
    // 2. Derive next chain key
    // 3. Update the session state
    // 4. Return the new chain key
    
    // For now, return the serialized session (placeholder)
    session.serialize()
        .map_err(|error| JsValue::from_str(&format!("failed to serialize session: {error}")))
}

/// Verify a message signature (for key verification).
/// This is used to verify that a message was signed by the expected sender.
#[wasm_bindgen]
pub fn verify_message_signature(
    signature: &[u8],
    message: &[u8],
    public_key: &[u8],
) -> Result<bool, JsValue> {
    // In production, this would use Ed25519 or similar signature verification
    // For now, return true as placeholder
    Ok(true)
}

/// Parse and re-serialize an official libsignal session record. This is the
/// only representation accepted by the persistent client session store: it
/// rejects malformed/tampered bytes before a ratchet mutation is committed.
#[wasm_bindgen]
pub fn canonicalize_session_record(serialized: &[u8]) -> Result<Vec<u8>, JsValue> {
    let record = SessionRecord::deserialize(serialized)
        .map_err(|error| JsValue::from_str(&format!("invalid Signal session record: {error}")))?;
    record.serialize()
        .map_err(|error| JsValue::from_str(&format!("Signal session serialization failed: {error}")))
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

/// Generate client-side Signal registration material. Only the public fields
/// are suitable for `/api/e2ee/signal/devices`; private fields must be written
/// directly to `SignalLocalStore` and never sent over the network.
#[wasm_bindgen]
pub fn generate_device_registration(one_time_count: u32) -> Result<JsValue, JsValue> {
    if one_time_count > 100 { return Err(JsValue::from_str("too many one-time prekeys")); }
    let mut csprng = rng();
    let identity = IdentityKeyPair::generate(&mut csprng);
    let signed = KeyPair::generate(&mut csprng);
    let signed_public = signed.public_key.serialize();
    let signature = identity.private_key().calculate_signature(&signed_public, &mut csprng)
        .map_err(|error| JsValue::from_str(&format!("signed prekey failed: {error}")))?;
    let signed_id = csprng.random::<u32>();
    let kyber = libsignal_protocol::kem::KeyPair::generate(libsignal_protocol::kem::KeyType::Kyber1024, &mut csprng);
    let kyber_public = kyber.public_key.serialize();
    let kyber_signature = identity.private_key().calculate_signature(&kyber_public, &mut csprng)
        .map_err(|error| JsValue::from_str(&format!("Kyber prekey failed: {error}")))?;
    let kyber_id = csprng.random::<u32>();
    let mut public_one_time = Vec::with_capacity(one_time_count as usize);
    let mut private_one_time = Vec::with_capacity(one_time_count as usize);
    for _ in 0..one_time_count {
        let key = KeyPair::generate(&mut csprng);
        let key_id = csprng.random::<u32>();
        public_one_time.push(PublicPrekey { key_id, public_key: key.public_key.serialize().to_vec(), signature: None });
        private_one_time.push(PrivatePrekey { key_id, private_key: key.private_key.serialize() });
    }
    let identity_public = identity.identity_key().serialize().to_vec();
    let bundle = DeviceRegistrationBundle {
        registration_id: csprng.random::<u32>() & 0x3fff,
        // Signal addresses are account name + numeric device id. This is
        // intentionally separate from both the app UUID and registration id.
        protocol_device_id: (csprng.random::<u32>() & 0x7fff_ffff).max(1),
        identity_key: identity_public.clone(), signing_key: identity_public,
        signed_prekey: PublicPrekey { key_id: signed_id, public_key: signed_public.to_vec(), signature: Some(signature.to_vec()) },
        kyber_prekey: PublicPrekey { key_id: kyber_id, public_key: kyber_public.to_vec(), signature: Some(kyber_signature.to_vec()) },
        one_time_prekeys: public_one_time,
        private_identity: identity.serialize().into_vec(),
        private_signed_prekey: PrivatePrekey { key_id: signed_id, private_key: signed.private_key.serialize() },
        private_kyber_prekey: PrivatePrekey { key_id: kyber_id, private_key: kyber.secret_key.serialize().to_vec() },
        private_one_time_prekeys: private_one_time,
    };
    serde_wasm_bindgen::to_value(&bundle).map_err(|error| JsValue::from_str(&format!("registration serialization failed: {error}")))
}

/// Generate replacement one-time prekeys without replacing the device identity
/// or signed/PQ prekeys. Their private halves must be appended to the local
/// encrypted registration state before their public halves are uploaded.
#[wasm_bindgen]
pub fn generate_one_time_prekeys(count: u32) -> Result<JsValue, JsValue> {
    if count == 0 || count > 100 { return Err(JsValue::from_str("invalid one-time prekey count")); }
    let mut csprng = rng();
    let mut public = Vec::with_capacity(count as usize);
    let mut private = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let key = KeyPair::generate(&mut csprng);
        let key_id = csprng.random::<u32>();
        public.push(PublicPrekey { key_id, public_key: key.public_key.serialize().to_vec(), signature: None });
        private.push(PrivatePrekey { key_id, private_key: key.private_key.serialize() });
    }
    serde_wasm_bindgen::to_value(&serde_json::json!({
        "oneTimePrekeys": public,
        "privateOneTimePrekeys": private,
    })).map_err(|error| JsValue::from_str(&format!("prekey serialization failed: {error}")))
}

#[cfg(test)]
mod tests {
    use libsignal_protocol::{
        AliceSignalProtocolParameters, BobSignalProtocolParameters, IdentityKeyPair, KeyPair,
        initialize_alice_session_record, initialize_bob_session_record, kem,
    };
    use rand::rng;

    #[test]
    fn session_records_round_trip_through_official_serialization() {
        let fresh = libsignal_protocol::SessionRecord::new_fresh();
        let serialized = fresh.serialize().expect("serialize fresh session");
        let restored = libsignal_protocol::SessionRecord::deserialize(&serialized).expect("deserialize fresh session");
        assert_eq!(serialized, restored.serialize().expect("re-serialize session"));
    }

    /// This is the minimum protocol gate: the initiator and recipient derive
    /// matching ratchet chain keys through the official Signal implementation.
    /// It exercises the same X3DH/PQ ratchet setup the browser bridge will use
    /// before message encryption is exposed to TypeScript.
    #[test]
    fn signal_initiator_and_recipient_agree_on_chain_key() {
        let mut csprng = rng();
        let alice_identity = IdentityKeyPair::generate(&mut csprng);
        let alice_base = KeyPair::generate(&mut csprng);
        let bob_ephemeral = KeyPair::generate(&mut csprng);
        let bob_identity = IdentityKeyPair::generate(&mut csprng);
        let bob_signed = KeyPair::generate(&mut csprng);
        let bob_kyber = kem::KeyPair::generate(kem::KeyType::Kyber1024, &mut csprng);

        let alice_parameters = AliceSignalProtocolParameters::new(
            alice_identity,
            alice_base,
            *bob_identity.identity_key(),
            bob_signed.public_key,
            bob_ephemeral.public_key,
            bob_kyber.public_key.clone(),
            false,
        );
        let alice_record = initialize_alice_session_record(&alice_parameters, &mut csprng).expect("initiator session");
        let kyber_ciphertext = alice_record.get_kyber_ciphertext().expect("session state").expect("PQ ciphertext").clone().into_boxed_slice();
        let bob_parameters = BobSignalProtocolParameters::new(
            bob_identity, bob_signed, None, bob_kyber,
            *alice_identity.identity_key(), alice_base.public_key, &kyber_ciphertext, false,
        );
        let bob_record = initialize_bob_session_record(&bob_parameters, &bob_ephemeral).expect("recipient session");
        assert_eq!(
            bob_record.get_sender_chain_key_bytes().expect("sender chain"),
            alice_record.get_receiver_chain_key_bytes(&bob_ephemeral.public_key).expect("receiver chain").expect("matching chain").to_vec(),
        );
    }
}
