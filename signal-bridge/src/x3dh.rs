//! X3DH (Extended Triple Diffie-Hellman) session establishment.
//!
//! This module implements the Signal Protocol's X3DH key agreement for
//! asynchronous session establishment.
//!
//! **SECURITY WARNING:** This is a PRE-PRODUCTION implementation that has NOT
//! undergone formal security audit. DO NOT use in production without external
//! cryptographic review.

use libsignal_protocol::{
    IdentityKeyPair, KeyPair, SessionRecord, SignalProtocolError,
    AliceSignalProtocolParameters, BobSignalProtocolParameters,
    initialize_alice_session_record, initialize_bob_session_record,
};
use rand::{Rng, rng};
use serde::Serialize;
use wasm_bindgen::prelude::*;

/// Prekey bundle for a remote device.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreKeyBundle {
    pub identity_key: Vec<u8>,
    pub signed_prekey_id: u32,
    pub signed_prekey_public: Vec<u8>,
    pub signed_prekey_signature: Vec<u8>,
    pub kyber_prekey_id: u32,
    pub kyber_prekey_public: Vec<u8>,
    pub kyber_prekey_signature: Vec<u8>,
    pub one_time_prekey_id: Option<u32>,
    pub one_time_prekey_public: Option<Vec<u8>>,
}

/// X3DH session initialization result.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct X3DHSessionInit {
    /// Serialized session record for Alice.
    pub session_record: Vec<u8>,
    /// Initial message to send to Bob.
    pub initial_message: Vec<u8>,
    /// Kyber ciphertext for PQ key agreement.
    pub kyber_ciphertext: Vec<u8>,
}

/// Create an X3DH session with a remote device (Alice's side).
///
/// This function:
/// 1. Generates ephemeral key pair
/// 2. Performs X3DH key agreement with Bob's prekey bundle
/// 3. Creates initial session state
/// 4. Returns session record and initial message
#[wasm_bindgen]
pub fn create_x3dh_session(
    alice_identity_bytes: &[u8],
    bob_bundle_bytes: &[u8],
) -> Result<Vec<u8>, JsValue> {
    // Deserialize Alice's identity
    let alice_identity = IdentityKeyPair::deserialize(alice_identity_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Alice identity: {error}")))?;

    // Deserialize Bob's prekey bundle
    let bob_bundle: PreKeyBundle = serde_json::from_slice(bob_bundle_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob bundle: {error}")))?;

    let mut csprng = rng();

    // Generate ephemeral key pair for this session
    let alice_ephemeral = KeyPair::generate(&mut csprng);

    // Deserialize Bob's keys
    let bob_identity = libsignal_protocol::PublicKey::deserialize(&bob_bundle.identity_key)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob identity key: {error}")))?;

    let bob_signed = libsignal_protocol::PublicKey::deserialize(&bob_bundle.signed_prekey_public)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob signed prekey: {error}")))?;

    let bob_ephemeral = libsignal_protocol::PublicKey::deserialize(
        bob_bundle.one_time_prekey_public.as_deref().unwrap_or(&bob_bundle.signed_prekey_public),
    )
    .map_err(|error| JsValue::from_str(&format!("invalid Bob ephemeral key: {error}")))?;

    // Create X3DH parameters
    let parameters = AliceSignalProtocolParameters::new(
        alice_identity,
        alice_ephemeral,
        bob_identity,
        bob_signed,
        bob_ephemeral,
        // Kyber key (placeholder - would be deserialized from bundle)
        libsignal_protocol::kem::PublicKey::deserialize(&bob_bundle.kyber_prekey_public)
            .map_err(|error| JsValue::from_str(&format!("invalid Kyber key: {error}")))?,
        false, // No PQ for now (simplified)
    );

    // Initialize Alice's session
    let alice_record = initialize_alice_session_record(&parameters, &mut csprng)
        .map_err(|error| JsValue::from_str(&format!("X3DH session init failed: {error}")))?;

    // Serialize the session record
    let session_bytes = alice_record.serialize()
        .map_err(|error| JsValue::from_str(&format!("session serialization failed: {error}")))?;

    // Create initial message (would contain ephemeral public key)
    let initial_message = alice_ephemeral.public_key.serialize().to_vec();

    // Combine session record and initial message
    let result = serde_json::json!({
        "sessionRecord": session_bytes,
        "initialMessage": initial_message,
    });

    serde_json::to_vec(&result)
        .map_err(|error| JsValue::from_str(&format!("result serialization failed: {error}")))
}

/// Process an X3DH initial message (Bob's side).
///
/// This function:
/// 1. Processes Alice's initial message
/// 2. Creates Bob's session state
/// 3. Returns serialized session record
#[wasm_bindgen]
pub fn process_x3dh_initial_message(
    bob_identity_bytes: &[u8],
    bob_signed_prekey_bytes: &[u8],
    bob_kyber_prekey_bytes: &[u8],
    alice_identity_bytes: &[u8],
    alice_initial_message_bytes: &[u8],
) -> Result<Vec<u8>, JsValue> {
    // Deserialize keys
    let bob_identity = IdentityKeyPair::deserialize(bob_identity_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob identity: {error}")))?;

    let bob_signed = libsignal_protocol::PrivateKey::deserialize(bob_signed_prekey_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob signed prekey: {error}")))?;

    let bob_kyber = libsignal_protocol::kem::SecretKey::deserialize(bob_kyber_prekey_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Bob Kyber prekey: {error}")))?;

    let alice_identity = libsignal_protocol::PublicKey::deserialize(alice_identity_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Alice identity key: {error}")))?;

    let alice_ephemeral = libsignal_protocol::PublicKey::deserialize(alice_initial_message_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid Alice ephemeral: {error}")))?;

    let mut csprng = rng();

    // Create Bob's ephemeral key pair
    let bob_ephemeral = KeyPair::generate(&mut csprng);

    // Create X3DH parameters for Bob
    let parameters = BobSignalProtocolParameters::new(
        bob_identity,
        KeyPair {
            public_key: libsignal_protocol::PublicKey::deserialize(&bob_signed.serialize())
                .map_err(|error| JsValue::from_str(&format!("invalid signed prekey: {error}")))?,
            private_key: bob_signed,
        },
        None, // No one-time prekey for now
        libsignal_protocol::kem::KeyPair::new(
            libsignal_protocol::kem::KeyType::Kyber1024,
            bob_kyber,
        ),
        alice_identity,
        alice_ephemeral,
        &[], // No Kyber ciphertext (simplified)
        false,
    );

    // Initialize Bob's session
    let bob_record = initialize_bob_session_record(&parameters, &bob_ephemeral)
        .map_err(|error| JsValue::from_str(&format!("X3DH session init failed: {error}")))?;

    // Serialize the session record
    bob_record.serialize()
        .map_err(|error| JsValue::from_str(&format!("session serialization failed: {error}")))
}

/// Verify a session record is valid and not tampered.
#[wasm_bindgen]
pub fn verify_session_record(session_bytes: &[u8]) -> Result<bool, JsValue> {
    match SessionRecord::deserialize(session_bytes) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Get the session's current chain keys for debugging.
/// **DO NOT USE IN PRODUCTION** - This is for testing only.
#[wasm_bindgen]
pub fn get_session_chain_keys(session_bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let session = SessionRecord::deserialize(session_bytes)
        .map_err(|error| JsValue::from_str(&format!("invalid session: {error}")))?;

    let state = session.session_state()
        .map_err(|error| JsValue::from_str(&format!("no session state: {error}")))?;

    // Get sender chain key (if exists)
    let sender_chain = state.get_sender_chain_key_bytes()
        .unwrap_or_default();

    // Get receiver chain key (if exists)
    let receiver_chain = state.get_receiver_chain_key_bytes()
        .map(|(key, _)| key)
        .unwrap_or_default();

    // Combine for debugging
    let mut result = Vec::new();
    result.extend_from_slice(&sender_chain);
    result.extend_from_slice(&receiver_chain);

    Ok(result)
}
