# Maddy Signal WebAssembly bridge

This AGPL-3.0-only crate is a browser/WebView bridge around the official
[`signalapp/libsignal`](https://github.com/signalapp/libsignal) Rust protocol
implementation. It is intentionally built as a separate component so the
encryption boundary can be tested and audited independently of the Next.js
application.

Private keys and ratchet state are local-only. The application server receives
only public device identity and prekey records.
