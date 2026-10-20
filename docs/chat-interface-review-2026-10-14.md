# Chat interface review

## Plan and root causes

Keep the working chat/encryption implementation. Fix shared overlay placement first, then replace the small attachment strip with a review surface and unify voice upload handling. Validate actual browser interactions, geometry, encryption and failure recovery before deployment.

1. Message history uses `content-visibility: auto`, which introduces paint containment. Menus inside those rows were clipped regardless of their z-index. Message/reaction menus now render through a body portal. The history optimization stays enabled. Positioning measures the anchor, flips/clamps within the visual viewport, limits height, and responds to resizing. Outside click, Escape, arrow keys and scroll are handled only while open.
2. Every message previously registered document click and keyboard handlers, including closed menus. Those handlers now exist only for the active overlay. The browser regression checks that closed actions do not create global listeners per row.
3. Header menus now use the same viewport-aware placement. Failed actions show retry guidance; a failed archive no longer navigates away. Requests are bounded and controls disabled while pending.
4. The touch long-press menu is portaled, scrollable on short screens and keyboard dismissible. It restores prior scroll/focus state. Touch devices can use it in landscape and on wide screens too; the desktop breakpoint must not hide an active touch menu and leave the page locked.
5. Selected attachments now open a native modal review: large contained photo/video preview, native video/audio controls, file fallback, thumbnail selection/removal, caption and explicit send. It adjusts to visual-viewport changes, including keyboard resizing. Captions use the existing encrypted draft storage; keystrokes do not rerender the message history.
6. Upload states distinguish device encryption, actual network progress and final server processing. Progress is bounded to 0–100%. Cancellation also invalidates work before the request begins. Uploads have a timeout; failures retain the files/caption. A timeout after sending asks the user to check the chat before retrying because a committed server request cannot be unsent by cancelling a browser request.
7. Voice notes have a separate review card with recording/pause controls, playback, discard and explicit send. They use the same encrypted upload/cancellation/progress implementation. Rapid microphone clicks are deduplicated, late permission results release their tracks after cancellation/unmount, and constructor failures clean up the stream. Stopping recording no longer counts its final segment twice.
8. The existing message-edit handler is now reachable through the menu. Copy/edit actions are unavailable when there is no decrypted text. Captions cannot fall back to plaintext when attachment encryption is selected.

## Verification

The browser regression uses disposable accounts and a loopback test database. It checks visible-menu hit targets at different history positions, reaction menus, short-screen header scrolling, long-press dismissal, portrait/landscape review sizing, caption retention, failed-upload recovery, cancellation before upload, and real encrypted media delivery. Photo captions must be ciphertext in the API response and readable by the intended recipient. Video fixtures are generated locally with MediaRecorder rather than downloaded. Voice capture uses Chromium's fake microphone stream through the real application recorder.

The existing suite also covers 320/360/390/412px layouts, long-history typing/scrolling, encrypted device recovery, attachments and access control, GIF/sticker playback, voice contrast, scheduled delivery, group editing and removed-member key exclusion. Broader CI includes authentication, authorization, dependencies, scanner integration and container readiness.

This is a targeted review of shared overlays, chat/media workflows and their async/input behavior, plus the existing wider regression suite. It is not a guarantee that every possible website/device interaction is defect-free. Headless mobile layouts do not replace physical Android/iOS keyboard, microphone and native-picker acceptance tests. No database migration, new dependency or paid service is introduced. Existing device keys and legacy backups are untouched.
