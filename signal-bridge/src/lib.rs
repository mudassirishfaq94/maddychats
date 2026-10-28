//! Client-only registration and official-libsignal ratchet adapter.
//! Experimental transport remains disabled until application integration,
//! cross-device persistence, compatibility tests and independent review pass.
#![forbid(unsafe_code)]
mod protocol;
use libsignal_protocol::{IdentityKeyPair, KeyPair, SessionRecord};
pub use protocol::{ratchet_decrypt, ratchet_encrypt, ratchet_establish};
use rand::{Rng, rng};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub fn protocol_version() -> u32 {
    2
}
#[wasm_bindgen]
pub fn ratchet_adapter_version() -> u32 {
    1
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IdentityBundle {
    /// Serialized private identity key pair. It must remain encrypted on the
    /// device and must never be sent to the application server.
    private_identity: Vec<u8>,
    /// Serialized public identity key for the device/prekey directory.
    public_identity: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicPrekey {
    key_id: u32,
    public_key: Vec<u8>,
    signature: Option<Vec<u8>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrivatePrekey {
    key_id: u32,
    private_key: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
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

#[wasm_bindgen]
pub fn get_sender_chain_key(_state: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("raw_chain_keys_unavailable"))
}
#[wasm_bindgen]
pub fn get_receiver_chain_key(_state: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("raw_chain_keys_unavailable"))
}
#[wasm_bindgen]
pub fn advance_sender_chain(_state: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_atomic_ratchet_adapter"))
}
#[wasm_bindgen]
pub fn advance_receiver_chain(_state: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_atomic_ratchet_adapter"))
}
#[wasm_bindgen]
pub fn encrypt_message(_state: &[u8], _plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_atomic_ratchet_adapter"))
}
#[wasm_bindgen]
pub fn decrypt_message(_state: &[u8], _ciphertext: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_atomic_ratchet_adapter"))
}
#[wasm_bindgen]
pub fn create_x3dh_session(_identity: &[u8], _bundle: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_verified_prekey_bundle"))
}
#[wasm_bindgen]
pub fn process_x3dh_initial_message(
    _identity: &[u8],
    _signed: &[u8],
    _kyber: &[u8],
    _remote: &[u8],
    _message: &[u8],
) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("use_authenticated_prekey_message"))
}
#[wasm_bindgen]
pub fn verify_session_record(state: &[u8]) -> bool {
    SessionRecord::deserialize(state).is_ok()
}
#[wasm_bindgen]
pub fn get_session_chain_keys(_state: &[u8]) -> Result<Vec<u8>, JsValue> {
    Err(JsValue::from_str("raw_chain_keys_unavailable"))
}
#[wasm_bindgen]
pub fn verify_message_signature(
    signature: &[u8],
    message: &[u8],
    public_key: &[u8],
) -> Result<bool, JsValue> {
    let key = libsignal_protocol::PublicKey::deserialize(public_key)
        .map_err(|_| JsValue::from_str("invalid_public_key"))?;
    Ok(key.verify_signature(message, signature))
}
/// Parse and re-serialize an official libsignal session record. This is the
/// only representation accepted by the persistent client session store: it
/// rejects malformed/tampered bytes before a ratchet mutation is committed.
#[wasm_bindgen]
pub fn canonicalize_session_record(serialized: &[u8]) -> Result<Vec<u8>, JsValue> {
    let record = SessionRecord::deserialize(serialized)
        .map_err(|error| JsValue::from_str(&format!("invalid Signal session record: {error}")))?;
    record.serialize().map_err(|error| {
        JsValue::from_str(&format!("Signal session serialization failed: {error}"))
    })
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
    if one_time_count > 100 {
        return Err(JsValue::from_str("too many one-time prekeys"));
    }
    let mut csprng = rng();
    let identity = IdentityKeyPair::generate(&mut csprng);
    let signed = KeyPair::generate(&mut csprng);
    let signed_public = signed.public_key.serialize();
    let signature = identity
        .private_key()
        .calculate_signature(&signed_public, &mut csprng)
        .map_err(|error| JsValue::from_str(&format!("signed prekey failed: {error}")))?;
    let signed_id = csprng.random::<u32>();
    let kyber = libsignal_protocol::kem::KeyPair::generate(
        libsignal_protocol::kem::KeyType::Kyber1024,
        &mut csprng,
    );
    let kyber_public = kyber.public_key.serialize();
    let kyber_signature = identity
        .private_key()
        .calculate_signature(&kyber_public, &mut csprng)
        .map_err(|error| JsValue::from_str(&format!("Kyber prekey failed: {error}")))?;
    let kyber_id = csprng.random::<u32>();
    let mut public_one_time = Vec::with_capacity(one_time_count as usize);
    let mut private_one_time = Vec::with_capacity(one_time_count as usize);
    for _ in 0..one_time_count {
        let key = KeyPair::generate(&mut csprng);
        let key_id = csprng.random::<u32>();
        public_one_time.push(PublicPrekey {
            key_id,
            public_key: key.public_key.serialize().to_vec(),
            signature: None,
        });
        private_one_time.push(PrivatePrekey {
            key_id,
            private_key: key.private_key.serialize(),
        });
    }
    let identity_public = identity.identity_key().serialize().to_vec();
    let bundle = DeviceRegistrationBundle {
        registration_id: csprng.random::<u32>() & 0x3fff,
        // Signal addresses are account name + numeric device id. This is
        // intentionally separate from both the app UUID and registration id.
        // Official libsignal DeviceId accepts 1..=127. The directory must
        // resolve address collisions without regenerating this identity.
        protocol_device_id: csprng.random_range(1..=127),
        identity_key: identity_public.clone(),
        signing_key: identity_public,
        signed_prekey: PublicPrekey {
            key_id: signed_id,
            public_key: signed_public.to_vec(),
            signature: Some(signature.to_vec()),
        },
        kyber_prekey: PublicPrekey {
            key_id: kyber_id,
            public_key: kyber_public.to_vec(),
            signature: Some(kyber_signature.to_vec()),
        },
        one_time_prekeys: public_one_time,
        private_identity: identity.serialize().into_vec(),
        private_signed_prekey: PrivatePrekey {
            key_id: signed_id,
            private_key: signed.private_key.serialize(),
        },
        private_kyber_prekey: PrivatePrekey {
            key_id: kyber_id,
            private_key: kyber.secret_key.serialize().to_vec(),
        },
        private_one_time_prekeys: private_one_time,
    };
    serde_wasm_bindgen::to_value(&bundle)
        .map_err(|error| JsValue::from_str(&format!("registration serialization failed: {error}")))
}

/// Generate replacement one-time prekeys without replacing the device identity
/// or signed/PQ prekeys. Their private halves must be appended to the local
/// encrypted registration state before their public halves are uploaded.
#[wasm_bindgen]
pub fn generate_one_time_prekeys(count: u32) -> Result<JsValue, JsValue> {
    if count == 0 || count > 100 {
        return Err(JsValue::from_str("invalid one-time prekey count"));
    }
    let mut csprng = rng();
    let mut public = Vec::with_capacity(count as usize);
    let mut private = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let key = KeyPair::generate(&mut csprng);
        let key_id = csprng.random::<u32>();
        public.push(PublicPrekey {
            key_id,
            public_key: key.public_key.serialize().to_vec(),
            signature: None,
        });
        private.push(PrivatePrekey {
            key_id,
            private_key: key.private_key.serialize(),
        });
    }
    serde_wasm_bindgen::to_value(&serde_json::json!({
        "oneTimePrekeys": public,
        "privateOneTimePrekeys": private,
    }))
    .map_err(|error| JsValue::from_str(&format!("prekey serialization failed: {error}")))
}
