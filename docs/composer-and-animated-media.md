# Compact composer and encrypted animated media

The message field grows to at most 96px and then scrolls internally. Attachment, emoji/media, schedule and send/voice controls remain 44px square and bottom-aligned inside one composer surface. Device safe-area spacing remains in AppShell rather than inflating the text field. Draft persistence, coalesced input/layout work, send behavior and encryption remain unchanged.

The existing Emoji button opens a lazy-loaded, page-level tray with Emoji, Stickers and GIFs tabs on mobile and desktop. Two independent first-party packs provide six transparent animated WebP reaction stickers and six illustrated GIF scenes (waving astronaut, cozy cat and coffee, bouncing popcorn, celebration trophy, flying rocket and sleepy moon/cloud). Each pack has its own labels and search tags. Local search filters the selected pack; this is not a third-party GIF catalog. Users can also choose their own GIF up to 3 MB. Selections are staged in the existing attachment preview and sent only after the usual Send action, through the existing encrypted attachment pipeline. Failed artwork fetches show retry guidance; closing the tray cancels outstanding selections.

Artwork is versioned, limited to 192px/12 frames/10 fps and under 256 KB per file. Previews use still PNGs for reduced-motion preferences. Public artwork receives immutable HTTP cache headers; private messages and decrypted media do not. No external GIF provider, tracking request, API key, subscription or new hosted service is used. Animation bytes are preserved without flattening frames.

Tests verify fixed control dimensions with short/long messages at 320/360/390/412/1280px, tray placement, reduced-motion previews, all animation frame counts/timing/size, actual UI selection, ciphertext retrieval and recipient decryption and visibly changing animation frames under enforced CSP. The full existing browser/security suite remains required before deployment; live checks use only owned temporary accounts and remove their uploads afterward.

Draft restoration records the input revision and never applies an older decrypted draft after a user edit, clear or acknowledged send. A delayed-decryption browser regression checks this explicitly; legacy plaintext migration persists the current input rather than resurrecting a cleared value. The login retry fixture closes and waits for all database connections before removing its temporary database, avoiding forced teardown errors.

GIF scene assets and still posters use new v2 URLs, so immutable caches cannot serve the former duplicate artwork. Existing v1 URLs remain available for older clients. Independent catalogs, poster pixels and tab/search results are regression-tested.

Delivery acknowledgement also retires pending encrypted draft writes before exposing an empty composer. Fast reloads after failed/lost-response retries cannot read the old submitted draft; text edited while storage finishes is preserved.
