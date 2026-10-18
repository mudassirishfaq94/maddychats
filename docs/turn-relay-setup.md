# Configure the missing call relay

The current screenshots show failed direct WebRTC connectivity. FCM can wake the phone, but it cannot relay audio. A TURN service is required on networks where direct connections fail. Circlo supports both an existing coturn server and Cloudflare Realtime TURN; it does not send message plaintext, encryption keys or decoded call audio to the relay. WebRTC media stays encrypted between the peers.

## Cloudflare setup

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/). Use your own account; the domain's DNS settings do not need to change.
2. Open Realtime → TURN and create a TURN key named **Circlo production**. If the account is new, review the service's billing/usage terms first. Cloudflare currently includes 1,000 GB monthly usage, with charges above that allowance; this is not an unlimited free service. Configure available usage notifications and review usage regularly.
3. Copy its **TURN key ID** and **TURN API token** directly into the existing Circlo Render service's **Environment** page:
   - `CF_TURN_KEY_ID`: the TURN key ID.
   - `CF_TURN_API_TOKEN`: its associated API token.
   Neither name may have a `NEXT_PUBLIC_` prefix. Do not paste values into chat, screenshots, Git, or browser code. They are not the shared-secret `TURN_SECRET` used by coturn.
4. Save the environment settings and let Render deploy. The authenticated `/api/calls/ice` endpoint should return `relayConfigured: true` with short-lived credentials. The provider API token must never appear in that response or any client bundle.
5. Test real calls across Wi-Fi and mobile data, with the recipient at Home, locked, and with the task swiped away. Verify Answer, Decline, cancellation, timeout, two-way audio and audio after locking during an established call. Use WebRTC statistics to confirm a relay candidate pair on a relay-only verification run. Successful direct calling does not establish relay delivery.

Circlo creates per-user credentials with a one-hour lifetime, caches them briefly in server memory, filters provider responses to Cloudflare's documented relay hosts/ports, and limits authenticated configuration requests. No new SDK is needed. A one-hour credential is not an unlimited-duration call guarantee; long-call credential refresh remains a separate validation case.

## Other remaining platform limits

Swiping a task away differs from Android force-stop; force-stopped delivery is not claimed. PWA background execution cannot match a native Android call service. Large media uses bounded encrypted upload chunks, but the configured private storage bucket's own object limit and storage quota must also accommodate the intended file sizes. Temporary chunks use encrypted local storage with expiry and a global staging quota; a server restart can require retrying an unfinished upload. No production encryption identity or historical ciphertext migration is required by these changes.

Sources: [Cloudflare credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [Cloudflare pricing](https://developers.cloudflare.com/realtime/turn/faq/).
