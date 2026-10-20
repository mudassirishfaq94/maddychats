# Full-screen attachment viewer

Message rows use `content-visibility: auto` for rendering performance. A fixed-position viewer nested inside such a row is confined to that containing block and clipped instead of covering the viewport.

The shared chat/gallery Lightbox now renders through a React portal into `document.body`. An opaque backdrop covers the chat. A separate safe-area toolbar contains the filename, download, zoom/fit and close controls; the remaining viewport contains the whole image at its original aspect ratio. Zoomed photos can be scrolled and returned to fit mode. Video playback and browser-side encrypted attachment resolution remain unchanged.

The viewer locks background scrolling, restores its previous value and the opening control's focus on close, traps keyboard focus between its buttons, and retains Escape and previous/next keyboard navigation. Missing encryption keys and network failures show actionable media guidance rather than a blank overlay.

`scripts/test-image-viewer.mjs`, called by the isolated restored-workflows suite, opens a real decrypted attachment at portrait-mobile, landscape and desktop sizes. It verifies page-level portal placement, full viewport coverage, uncropped aspect ratio, zoom/fit, close controls, Escape, focus restoration and scroll unlocking.
