/* tslint:disable */
/* eslint-disable */

export function advance_receiver_chain(_state: Uint8Array): Uint8Array;

export function advance_sender_chain(_state: Uint8Array): Uint8Array;

/**
 * Parse and re-serialize an official libsignal session record. This is the
 * only representation accepted by the persistent client session store: it
 * rejects malformed/tampered bytes before a ratchet mutation is committed.
 */
export function canonicalize_session_record(serialized: Uint8Array): Uint8Array;

export function create_x3dh_session(_identity: Uint8Array, _bundle: Uint8Array): Uint8Array;

export function decrypt_message(_state: Uint8Array, _ciphertext: Uint8Array): Uint8Array;

export function encrypt_message(_state: Uint8Array, _plaintext: Uint8Array): Uint8Array;

/**
 * Generate client-side Signal registration material. Only the public fields
 * are suitable for `/api/e2ee/signal/devices`; private fields must be written
 * directly to `SignalLocalStore` and never sent over the network.
 */
export function generate_device_registration(one_time_count: number): any;

/**
 * Create a new Signal identity key pair entirely in the client runtime.
 *
 * The returned private bytes are for a future encrypted local key store only.
 * This function is deliberately separate from device registration so callers
 * cannot accidentally upload private key material.
 */
export function generate_identity(): any;

/**
 * Generate replacement one-time prekeys without replacing the device identity
 * or signed/PQ prekeys. Their private halves must be appended to the local
 * encrypted registration state before their public halves are uploaded.
 */
export function generate_one_time_prekeys(count: number): any;

export function get_receiver_chain_key(_state: Uint8Array): Uint8Array;

export function get_sender_chain_key(_state: Uint8Array): Uint8Array;

export function get_session_chain_keys(_state: Uint8Array): Uint8Array;

export function process_x3dh_initial_message(_identity: Uint8Array, _signed: Uint8Array, _kyber: Uint8Array, _remote: Uint8Array, _message: Uint8Array): Uint8Array;

export function protocol_version(): number;

export function ratchet_adapter_version(): number;

export function ratchet_decrypt(context: Uint8Array, kind: number, ciphertext: Uint8Array): Promise<Uint8Array>;

export function ratchet_encrypt(context: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;

export function ratchet_establish(context: Uint8Array, bundle: Uint8Array): Promise<Uint8Array>;

export function ratchet_import_registration(registration: Uint8Array, local_name: string): Uint8Array;

export function verify_message_signature(signature: Uint8Array, message: Uint8Array, public_key: Uint8Array): boolean;

export function verify_session_record(state: Uint8Array): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly advance_receiver_chain: (a: number, b: number) => [number, number, number, number];
    readonly advance_sender_chain: (a: number, b: number) => [number, number, number, number];
    readonly canonicalize_session_record: (a: number, b: number) => [number, number, number, number];
    readonly create_x3dh_session: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly decrypt_message: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly encrypt_message: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly generate_device_registration: (a: number) => [number, number, number];
    readonly generate_identity: () => [number, number, number];
    readonly generate_one_time_prekeys: (a: number) => [number, number, number];
    readonly get_receiver_chain_key: (a: number, b: number) => [number, number, number, number];
    readonly get_sender_chain_key: (a: number, b: number) => [number, number, number, number];
    readonly get_session_chain_keys: (a: number, b: number) => [number, number, number, number];
    readonly process_x3dh_initial_message: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly protocol_version: () => number;
    readonly ratchet_adapter_version: () => number;
    readonly ratchet_decrypt: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly ratchet_encrypt: (a: number, b: number, c: number, d: number) => any;
    readonly ratchet_establish: (a: number, b: number, c: number, d: number) => any;
    readonly ratchet_import_registration: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly verify_message_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly verify_session_record: (a: number, b: number) => number;
    readonly wasm_bindgen_ca47c4c6f8cfe56f___convert__closures_____invoke___js_sys_15551f8eb071ad1b___Function_fn_wasm_bindgen_ca47c4c6f8cfe56f___JsValue_____wasm_bindgen_ca47c4c6f8cfe56f___sys__Undefined___js_sys_15551f8eb071ad1b___Function_fn_wasm_bindgen_ca47c4c6f8cfe56f___JsValue_____wasm_bindgen_ca47c4c6f8cfe56f___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_ca47c4c6f8cfe56f___convert__closures_____invoke___wasm_bindgen_ca47c4c6f8cfe56f___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_ca47c4c6f8cfe56f___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
