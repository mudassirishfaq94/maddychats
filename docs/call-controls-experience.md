# Call controls and notification presentation

The prior device test confirmed incoming calls connect after unlocking from the notification's Answer action. The user requested a richer functional call screen and ongoing duration display. This follow-up does not change call signaling, encryption, relay configuration or notification delivery.

## Changes

- Call screen: contact monogram, encrypted-audio label, elapsed duration from the first media connection, mute/unmute, end, minimize and return. Reconnection and minimizing preserve elapsed time. No recording, hold or video controls are shown because those capabilities are not implemented.
- Android 12+: the output selector queries actual communication devices and selects their system IDs through AudioManager. Earpiece, speaker and connected audio accessories are offered only when available. The selected route is read back from Android; failures are visible. No new Bluetooth/contact/runtime permissions or dependencies. Selection is cleared when the call service ends.
- Browsers: output selection is shown only where the browser exposes a selection API; unsupported browsers retain their operating system audio controls. Muting and duration work independently of that capability.
- Active Android calls retain the existing microphone foreground service. Its silent, ongoing CallStyle notification includes a system chronometer starting on media connection and reflects mute state. End and return actions remain supported. The notification uses a generic identity so this new surface does not bypass account preview preferences or chat locks.
- Native message and incoming-call notifications use a Circlo accent and in-memory monograms. Decrypted message notifications retain Android MessagingStyle. Requests and locked chats do not acquire sender avatars or previews. No notification text or avatar is newly cached to disk, fetched over the network, or sent to FCM.

## Verification and limits

Unit coverage exercises duration boundaries. The production-bundle browser suite establishes real WebRTC, checks the advancing timer, outgoing microphone tracks while muting, minimize/restore continuity, and reachable hang-up on a 360-pixel viewport. Mobile/desktop fixture screenshots are uploaded by CI. Android compile/JVM tests check compatibility; real earpiece/speaker/accessory routing, system chronometer presentation and locked/background continuity still require the Poco test.

Android and its manufacturer control notification layout, expansion and lock-screen presentation. No custom notification template bypasses these controls. Bluetooth availability depends on the connected device and system. Native background microphone service behavior does not establish PWA closed-app calling support. Force-stopped delivery is not claimed. Existing recipient-local decryption requirements and generic closed-app notification fallback remain unchanged.

No database, encryption-key or historical data migration is needed. Web changes are compatible with older APKs; their existing controls remain available, while route selection and notification chronometer require this APK update. Deployment and physical results are recorded separately after testing.
