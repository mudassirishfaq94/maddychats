//! Transport-free adapter to official libsignal operations. No chain-key extraction.
//! Inputs and returned state contain private material: persist locally, encrypted,
//! atomically, before releasing ciphertext or acknowledging/displaying plaintext.
use async_trait::async_trait;
use libsignal_protocol::{
    self as signal, CiphertextMessage, CiphertextMessageType, GenericSignedPreKey, IdentityKey,
    IdentityKeyPair, IdentityKeyStore, InMemKyberPreKeyStore, InMemSignalProtocolStore,
    KyberPreKeyId, KyberPreKeyRecord, KyberPreKeyStore, PreKeyStore, ProtocolAddress, PublicKey,
    SessionStore, SignalProtocolError, SignedPreKeyId, SignedPreKeyStore,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, time::SystemTime};
use wasm_bindgen::prelude::*;

fn current_time() -> signal::error::Result<SystemTime> {
    #[cfg(target_arch = "wasm32")]
    {
        let milliseconds = js_sys::Date::now();
        if !milliseconds.is_finite() || !(0.0..=8_640_000_000_000_000.0).contains(&milliseconds) {
            return Err(SignalProtocolError::InvalidArgument(
                "invalid device clock".into(),
            ));
        }
        Ok(SystemTime::UNIX_EPOCH + std::time::Duration::from_millis(milliseconds as u64))
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        Ok(SystemTime::now())
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Address {
    pub name: String,
    pub device_id: u32,
}
impl Address {
    fn parse(&self) -> signal::error::Result<ProtocolAddress> {
        if self.name.is_empty() || self.name.len() > 128 {
            return Err(SignalProtocolError::InvalidArgument(
                "invalid protocol address".into(),
            ));
        }
        Ok(ProtocolAddress::new(
            self.name.clone(),
            self.device_id.try_into().map_err(|_| {
                SignalProtocolError::InvalidArgument("invalid device number".into())
            })?,
        ))
    }
}

// One pair's session plus the device's private prekeys. The application must
// serialize transitions across tabs and commit session + consumed prekeys together.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub local: Address,
    pub remote: Address,
    pub registration_id: u32,
    pub private_identity: Vec<u8>,
    /// Pinned by an explicit, authenticated device/identity approval outside this adapter.
    pub approved_remote_identity: Vec<u8>,
    pub session_record: Option<Vec<u8>>,
    pub prekeys: Vec<Vec<u8>>,
    pub signed_prekeys: Vec<Vec<u8>>,
    pub kyber_prekeys: Vec<Vec<u8>>,
    #[serde(default)]
    pub used_kyber_bases: BTreeSet<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DevicePrivateState {
    pub local: Address,
    pub registration_id: u32,
    pub private_identity: Vec<u8>,
    pub prekeys: Vec<Vec<u8>>,
    pub signed_prekeys: Vec<Vec<u8>>,
    pub kyber_prekeys: Vec<Vec<u8>>,
    pub used_kyber_bases: BTreeSet<String>,
}

fn import_registration(
    registration: crate::DeviceRegistrationBundle,
    name: String,
) -> signal::error::Result<DevicePrivateState> {
    let local = Address {
        name,
        device_id: registration.protocol_device_id,
    };
    local.parse()?;
    let invalid = || SignalProtocolError::InvalidArgument("invalid local registration".into());
    let identity = IdentityKeyPair::try_from(registration.private_identity.as_slice())?;
    if identity.identity_key().serialize().as_ref() != registration.identity_key.as_slice()
        || registration.identity_key != registration.signing_key
        || registration.registration_id > 0x3fff
        || registration.signed_prekey.key_id != registration.private_signed_prekey.key_id
        || registration.kyber_prekey.key_id != registration.private_kyber_prekey.key_id
        || registration.one_time_prekeys.len() != registration.private_one_time_prekeys.len()
        || registration.one_time_prekeys.len() > 1000
    {
        return Err(invalid());
    }
    let pair = signal::KeyPair::from_public_and_private(
        &registration.signed_prekey.public_key,
        &registration.private_signed_prekey.private_key,
    )?;
    if pair.private_key.public_key()? != pair.public_key {
        return Err(invalid());
    }
    let signature = registration.signed_prekey.signature.ok_or_else(invalid)?;
    if !identity
        .public_key()
        .verify_signature(&registration.signed_prekey.public_key, &signature)
    {
        return Err(invalid());
    }
    let signed = signal::SignedPreKeyRecord::new(
        registration.signed_prekey.key_id.into(),
        signal::Timestamp::from_epoch_millis(0),
        &pair,
        &signature,
    );
    let kyber = signal::kem::KeyPair::new(
        signal::kem::PublicKey::deserialize(&registration.kyber_prekey.public_key)?,
        signal::kem::SecretKey::deserialize(&registration.private_kyber_prekey.private_key)?,
    );
    let signature = registration.kyber_prekey.signature.ok_or_else(invalid)?;
    if !identity
        .public_key()
        .verify_signature(&registration.kyber_prekey.public_key, &signature)
    {
        return Err(invalid());
    }
    let kyber = KyberPreKeyRecord::new(
        registration.kyber_prekey.key_id.into(),
        signal::Timestamp::from_epoch_millis(0),
        &kyber,
        &signature,
    );
    let mut seen = BTreeSet::new();
    let mut prekeys = Vec::new();
    for public in registration.one_time_prekeys {
        if !seen.insert(public.key_id) {
            return Err(invalid());
        }
        let private = registration
            .private_one_time_prekeys
            .iter()
            .find(|key| key.key_id == public.key_id)
            .ok_or_else(invalid)?;
        let pair =
            signal::KeyPair::from_public_and_private(&public.public_key, &private.private_key)?;
        if pair.private_key.public_key()? != pair.public_key {
            return Err(invalid());
        }
        prekeys.push(signal::PreKeyRecord::new(public.key_id.into(), &pair).serialize()?);
    }
    Ok(DevicePrivateState {
        local,
        registration_id: registration.registration_id,
        private_identity: registration.private_identity,
        prekeys,
        signed_prekeys: vec![signed.serialize()?],
        kyber_prekeys: vec![kyber.serialize()?],
        used_kyber_bases: BTreeSet::new(),
    })
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteBundle {
    pub registration_id: u32,
    pub identity_key: Vec<u8>,
    pub signed_prekey_id: u32,
    pub signed_prekey: Vec<u8>,
    pub signed_prekey_signature: Vec<u8>,
    pub kyber_prekey_id: u32,
    pub kyber_prekey: Vec<u8>,
    pub kyber_prekey_signature: Vec<u8>,
    pub one_time_prekey: Option<(u32, Vec<u8>)>,
}

struct ReplaySafeKyberStore {
    inner: InMemKyberPreKeyStore,
    used: BTreeSet<String>,
}
#[async_trait(?Send)]
impl KyberPreKeyStore for ReplaySafeKyberStore {
    async fn get_kyber_pre_key(
        &self,
        id: KyberPreKeyId,
    ) -> signal::error::Result<KyberPreKeyRecord> {
        self.inner.get_kyber_pre_key(id).await
    }
    async fn save_kyber_pre_key(
        &mut self,
        id: KyberPreKeyId,
        record: &KyberPreKeyRecord,
    ) -> signal::error::Result<()> {
        self.inner.save_kyber_pre_key(id, record).await
    }
    async fn mark_kyber_pre_key_used(
        &mut self,
        id: KyberPreKeyId,
        signed: SignedPreKeyId,
        base: &PublicKey,
    ) -> signal::error::Result<()> {
        // Public-key tuple only. Retained across restarts; never silently evicted.
        let key = format!(
            "{}:{}:{:?}",
            u32::from(id),
            u32::from(signed),
            base.serialize()
        );
        if self.used.contains(&key) || self.used.len() >= 10000 {
            return Err(SignalProtocolError::InvalidMessage(
                CiphertextMessageType::PreKey,
                "prekey replay or rotation required".into(),
            ));
        }
        self.inner.mark_kyber_pre_key_used(id, signed, base).await?;
        self.used.insert(key);
        Ok(())
    }
}

impl Context {
    async fn restore(
        &self,
    ) -> signal::error::Result<(InMemSignalProtocolStore, ReplaySafeKyberStore)> {
        self.local.parse()?;
        self.remote.parse()?;
        if self.registration_id > 0x3fff
            || self.prekeys.len() > 1000
            || self.signed_prekeys.len() > 100
            || self.kyber_prekeys.len() > 100
            || self.used_kyber_bases.len() > 10000
        {
            return Err(SignalProtocolError::InvalidArgument(
                "invalid private state bounds".into(),
            ));
        }
        let identity = IdentityKeyPair::try_from(self.private_identity.as_slice())?;
        let mut store = InMemSignalProtocolStore::new(identity, self.registration_id)?;
        // Never use InMemIdentityKeyStore's default acceptance of unknown peers.
        let approved = IdentityKey::try_from(self.approved_remote_identity.as_slice())?;
        store
            .identity_store
            .save_identity(&self.remote.parse()?, &approved)
            .await?;
        if let Some(bytes) = &self.session_record {
            store
                .session_store
                .store_session(
                    &self.remote.parse()?,
                    &signal::SessionRecord::deserialize(bytes)?,
                )
                .await?;
        }
        for bytes in &self.prekeys {
            let record = signal::PreKeyRecord::deserialize(bytes)?;
            store
                .pre_key_store
                .save_pre_key(record.id()?, &record)
                .await?;
        }
        for bytes in &self.signed_prekeys {
            let record = signal::SignedPreKeyRecord::deserialize(bytes)?;
            store
                .signed_pre_key_store
                .save_signed_pre_key(record.id()?, &record)
                .await?;
        }
        let mut kyber = ReplaySafeKyberStore {
            inner: InMemKyberPreKeyStore::new(),
            used: self.used_kyber_bases.clone(),
        };
        for bytes in &self.kyber_prekeys {
            let record = KyberPreKeyRecord::deserialize(bytes)?;
            kyber.save_kyber_pre_key(record.id()?, &record).await?;
        }
        Ok((store, kyber))
    }

    async fn committed(
        mut self,
        store: &InMemSignalProtocolStore,
        kyber: ReplaySafeKyberStore,
    ) -> signal::error::Result<Self> {
        self.session_record = store
            .session_store
            .load_session(&self.remote.parse()?)
            .await?
            .map(|record| record.serialize())
            .transpose()?;
        // Consumed one-time prekeys must disappear in the same persisted result.
        let mut remaining = Vec::new();
        for bytes in &self.prekeys {
            let id = signal::PreKeyRecord::deserialize(bytes)?.id()?;
            match store.pre_key_store.get_pre_key(id).await {
                Ok(record) => remaining.push(record.serialize()?),
                Err(SignalProtocolError::InvalidPreKeyId) => {}
                Err(error) => return Err(error),
            }
        }
        self.prekeys = remaining;
        self.used_kyber_bases = kyber.used;
        Ok(self)
    }
}

pub async fn establish(context: Context, bundle: RemoteBundle) -> signal::error::Result<Context> {
    if context.session_record.is_some() || bundle.identity_key != context.approved_remote_identity {
        return Err(SignalProtocolError::InvalidArgument(
            "session exists or identity is not approved".into(),
        ));
    }
    let remote = context.remote.parse()?;
    let local = context.local.parse()?;
    let (mut store, kyber) = context.restore().await?;
    let bundle = signal::PreKeyBundle::new(
        bundle.registration_id,
        remote.device_id(),
        bundle
            .one_time_prekey
            .map(|(id, bytes)| PublicKey::deserialize(&bytes).map(|key| (id.into(), key)))
            .transpose()?,
        bundle.signed_prekey_id.into(),
        PublicKey::deserialize(&bundle.signed_prekey)?,
        bundle.signed_prekey_signature,
        bundle.kyber_prekey_id.into(),
        signal::kem::PublicKey::deserialize(&bundle.kyber_prekey)?,
        bundle.kyber_prekey_signature,
        IdentityKey::try_from(bundle.identity_key.as_slice())?,
    )?;
    // Official API verifies both signed prekeys and performs PQXDH session setup.
    signal::process_prekey_bundle(
        &remote,
        &local,
        &mut store.session_store,
        &mut store.identity_store,
        &bundle,
        current_time()?,
        &mut rand::rng(),
    )
    .await?;
    context.committed(&store, kyber).await
}

pub async fn encrypt(
    context: Context,
    plaintext: &[u8],
) -> signal::error::Result<(Context, u8, Vec<u8>)> {
    let (mut store, kyber) = context.restore().await?;
    let ciphertext = signal::message_encrypt(
        plaintext,
        &context.remote.parse()?,
        &context.local.parse()?,
        &mut store.session_store,
        &mut store.identity_store,
        current_time()?,
        &mut rand::rng(),
    )
    .await?;
    let kind = ciphertext.message_type() as u8;
    let bytes = ciphertext.serialize().to_vec();
    Ok((context.committed(&store, kyber).await?, kind, bytes))
}

pub async fn decrypt(
    context: Context,
    kind: u8,
    ciphertext: &[u8],
) -> signal::error::Result<(Context, Vec<u8>)> {
    let message = match kind {
        2 => CiphertextMessage::SignalMessage(signal::SignalMessage::try_from(ciphertext)?),
        3 => CiphertextMessage::PreKeySignalMessage(signal::PreKeySignalMessage::try_from(
            ciphertext,
        )?),
        _ => {
            return Err(SignalProtocolError::InvalidArgument(
                "unsupported message type".into(),
            ));
        }
    };
    let (mut store, mut kyber) = context.restore().await?;
    let plaintext = signal::message_decrypt(
        &message,
        &context.remote.parse()?,
        &context.local.parse()?,
        &mut store.session_store,
        &mut store.identity_store,
        &mut store.pre_key_store,
        &store.signed_pre_key_store,
        &mut kyber,
        &mut rand::rng(),
    )
    .await?;
    Ok((context.committed(&store, kyber).await?, plaintext))
}

fn parse<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T, JsValue> {
    if bytes.len() > 8 * 1024 * 1024 {
        return Err(JsValue::from_str("signal_state_too_large"));
    }
    serde_json::from_slice(bytes).map_err(|_| JsValue::from_str("signal_invalid_state"))
}
fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, JsValue> {
    serde_json::to_vec(value).map_err(|_| JsValue::from_str("signal_state_encoding_failed"))
}

#[wasm_bindgen]
pub fn ratchet_import_registration(
    registration: Vec<u8>,
    local_name: String,
) -> Result<Vec<u8>, JsValue> {
    let private = import_registration(parse(&registration)?, local_name)
        .map_err(|_| JsValue::from_str("signal_invalid_local_registration"))?;
    encode(&private)
}

#[wasm_bindgen]
pub async fn ratchet_establish(context: Vec<u8>, bundle: Vec<u8>) -> Result<Vec<u8>, JsValue> {
    let next = establish(parse(&context)?, parse(&bundle)?)
        .await
        .map_err(|_| JsValue::from_str("signal_session_setup_failed"))?;
    encode(&next)
}
#[wasm_bindgen]
pub async fn ratchet_encrypt(context: Vec<u8>, plaintext: Vec<u8>) -> Result<Vec<u8>, JsValue> {
    if plaintext.len() > 64 * 1024 {
        return Err(JsValue::from_str("signal_message_too_large"));
    }
    let (next, kind, ciphertext) = encrypt(parse(&context)?, &plaintext)
        .await
        .map_err(|_| JsValue::from_str("signal_encrypt_failed"))?;
    encode(&serde_json::json!({ "state": next, "messageType": kind, "ciphertext": ciphertext }))
}
#[wasm_bindgen]
pub async fn ratchet_decrypt(
    context: Vec<u8>,
    kind: u8,
    ciphertext: Vec<u8>,
) -> Result<Vec<u8>, JsValue> {
    if ciphertext.len() > 128 * 1024 {
        return Err(JsValue::from_str("signal_message_too_large"));
    }
    let (next, plaintext) = decrypt(parse(&context)?, kind, &ciphertext)
        .await
        .map_err(|_| JsValue::from_str("signal_decrypt_failed"))?;
    encode(&serde_json::json!({ "state": next, "plaintext": plaintext }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_executor::block_on;
    use signal::{KeyPair, PreKeyRecord, SignedPreKeyRecord, Timestamp};

    fn device(name: &str) -> Context {
        let mut rng = rand::rng();
        let identity = IdentityKeyPair::generate(&mut rng);
        let signed = KeyPair::generate(&mut rng);
        let signature = identity
            .private_key()
            .calculate_signature(&signed.public_key.serialize(), &mut rng)
            .unwrap();
        let kyber = signal::kem::KeyPair::generate(signal::kem::KeyType::Kyber1024, &mut rng);
        let kyber_signature = identity
            .private_key()
            .calculate_signature(&kyber.public_key.serialize(), &mut rng)
            .unwrap();
        Context {
            local: Address {
                name: name.into(),
                device_id: 1,
            },
            remote: Address {
                name: "unassigned".into(),
                device_id: 1,
            },
            registration_id: 123,
            private_identity: identity.serialize().into_vec(),
            approved_remote_identity: vec![],
            session_record: None,
            prekeys: vec![
                PreKeyRecord::new(3.into(), &KeyPair::generate(&mut rng))
                    .serialize()
                    .unwrap(),
            ],
            signed_prekeys: vec![
                SignedPreKeyRecord::new(
                    1.into(),
                    Timestamp::from_epoch_millis(1),
                    &signed,
                    &signature,
                )
                .serialize()
                .unwrap(),
            ],
            kyber_prekeys: vec![
                KyberPreKeyRecord::new(
                    2.into(),
                    Timestamp::from_epoch_millis(1),
                    &kyber,
                    &kyber_signature,
                )
                .serialize()
                .unwrap(),
            ],
            used_kyber_bases: BTreeSet::new(),
        }
    }
    fn identity(context: &Context) -> Vec<u8> {
        IdentityKeyPair::try_from(context.private_identity.as_slice())
            .unwrap()
            .identity_key()
            .serialize()
            .to_vec()
    }
    fn fixture() -> (Context, Context) {
        let mut alice = device("11111111-1111-4111-8111-111111111111");
        let mut bob = device("22222222-2222-4222-8222-222222222222");
        alice.remote = bob.local.clone();
        bob.remote = alice.local.clone();
        alice.approved_remote_identity = identity(&bob);
        bob.approved_remote_identity = identity(&alice);
        (alice, bob)
    }
    fn bundle(context: &Context) -> RemoteBundle {
        let signed = SignedPreKeyRecord::deserialize(&context.signed_prekeys[0]).unwrap();
        let kyber = KyberPreKeyRecord::deserialize(&context.kyber_prekeys[0]).unwrap();
        let prekey = PreKeyRecord::deserialize(&context.prekeys[0]).unwrap();
        RemoteBundle {
            registration_id: context.registration_id,
            identity_key: identity(context),
            signed_prekey_id: signed.id().unwrap().into(),
            signed_prekey: signed.public_key().unwrap().serialize().to_vec(),
            signed_prekey_signature: signed.signature().unwrap(),
            kyber_prekey_id: kyber.id().unwrap().into(),
            kyber_prekey: kyber.public_key().unwrap().serialize().to_vec(),
            kyber_prekey_signature: kyber.signature().unwrap(),
            one_time_prekey: Some((
                prekey.id().unwrap().into(),
                prekey.public_key().unwrap().serialize().to_vec(),
            )),
        }
    }
    fn restart(context: &Context) -> Context {
        serde_json::from_slice(&serde_json::to_vec(context).unwrap()).unwrap()
    }

    #[test]
    fn bidirectional_ratchet_survives_restart_and_consumes_prekey() {
        block_on(async {
            let (alice, mut bob) = fixture();
            let mut alice = establish(alice, bundle(&bob)).await.unwrap();
            for counter in 0..20 {
                let previous = alice.session_record.clone();
                let (next, kind, ciphertext) = encrypt(restart(&alice), b"synthetic message")
                    .await
                    .unwrap();
                assert_ne!(
                    previous, next.session_record,
                    "sending must advance persisted state"
                );
                alice = next;
                let (next, plaintext) = decrypt(restart(&bob), kind, &ciphertext).await.unwrap();
                assert_eq!(plaintext, b"synthetic message");
                bob = next;
                assert!(
                    bob.prekeys.is_empty(),
                    "initial one-time prekey must be consumed"
                );
                assert!(
                    decrypt(restart(&bob), kind, &ciphertext).await.is_err(),
                    "replay rejected after restart"
                );
                let (next, kind, reply) = encrypt(restart(&bob), b"synthetic reply").await.unwrap();
                bob = next;
                let (next, plaintext) = decrypt(restart(&alice), kind, &reply).await.unwrap();
                alice = next;
                assert_eq!(plaintext, b"synthetic reply");
                if counter == 19 {
                    assert!(!bob.used_kyber_bases.is_empty());
                }
            }
        });
    }

    #[test]
    fn delayed_messages_open_once_without_resetting_the_session() {
        block_on(async {
            let (alice, mut bob) = fixture();
            let mut alice = establish(alice, bundle(&bob)).await.unwrap();
            let mut messages = Vec::new();
            for index in 0..8 {
                let (next, kind, ciphertext) = encrypt(alice, &[index]).await.unwrap();
                alice = next;
                messages.push((kind, ciphertext));
            }
            for index in [7, 0, 4, 1, 6, 2, 5, 3] {
                let (kind, ciphertext) = &messages[index];
                let (next, plaintext) = decrypt(restart(&bob), *kind, ciphertext).await.unwrap();
                bob = next;
                assert_eq!(plaintext, vec![index as u8]);
                assert!(decrypt(restart(&bob), *kind, ciphertext).await.is_err());
            }
        });
    }

    #[test]
    fn changed_identity_and_invalid_prekey_signatures_fail_closed() {
        block_on(async {
            let (alice, bob) = fixture();
            let mut changed = bundle(&bob);
            changed.identity_key = identity(&device("other"));
            assert!(establish(restart(&alice), changed).await.is_err());
            let mut invalid = bundle(&bob);
            invalid.signed_prekey_signature[0] ^= 1;
            assert!(establish(restart(&alice), invalid).await.is_err());
            let mut invalid = bundle(&bob);
            invalid.kyber_prekey_signature[0] ^= 1;
            assert!(establish(restart(&alice), invalid).await.is_err());
            let alice = establish(alice, bundle(&bob)).await.unwrap();
            assert!(
                establish(alice, bundle(&bob)).await.is_err(),
                "no implicit session replacement"
            );
        });
    }

    #[test]
    fn ciphertext_tampering_wrong_identity_and_type_do_not_consume_state() {
        block_on(async {
            let (alice, bob) = fixture();
            let alice = establish(alice, bundle(&bob)).await.unwrap();
            let (_, kind, ciphertext) = encrypt(alice, b"synthetic payload").await.unwrap();
            let mut invalid = ciphertext.clone();
            *invalid.last_mut().unwrap() ^= 1;
            assert!(decrypt(restart(&bob), kind, &invalid).await.is_err());
            assert!(decrypt(restart(&bob), 255, &ciphertext).await.is_err());
            let mut wrong = restart(&bob);
            wrong.approved_remote_identity = identity(&device("other"));
            assert!(decrypt(wrong, kind, &ciphertext).await.is_err());
            assert!(
                decrypt(bob, kind, &ciphertext).await.is_ok(),
                "valid message still opens after rejected attempts"
            );
        });
    }

    #[test]
    fn reusable_pq_prekey_replay_is_rejected_after_session_loss() {
        block_on(async {
            let (alice, bob) = fixture();
            let mut public = bundle(&bob);
            public.one_time_prekey = None;
            let alice = establish(alice, public).await.unwrap();
            let (_, kind, ciphertext) = encrypt(alice, b"synthetic payload").await.unwrap();
            let (mut bob, _) = decrypt(bob, kind, &ciphertext).await.unwrap();
            bob.session_record = None;
            assert!(
                decrypt(restart(&bob), kind, &ciphertext).await.is_err(),
                "PQ replay markers survive lost session state"
            );
        });
    }
}
