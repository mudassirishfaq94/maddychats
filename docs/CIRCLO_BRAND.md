# Circlo visual identity and next steps

Implemented: circular lock mark inspired by supplied reference 2; reusable inline
vector logo; light/dark SVG variants; favicon and regular/maskable install icons;
ink-and-mint UI tokens; dark default with saved light/system preferences preserved;
self-hosted Sora headings and Inter UI; responsive landing and authentication pages.

Tagline: **Your circle. Your secrets. Sealed.**

Palette: trust blue `#0F4C75`, deep ink `#0B1D26`, electric mint `#00FFC6`,
paper white `#F8F9FA`, alert coral `#FF5A5F`. Light-mode text accents and errors
use darker equivalents to preserve readability. General icons use rounded 1.5px
strokes. Blur is restricted to the public header, not messages or the composer.

Assets: `/brand/circlo-light.svg`, `/brand/circlo-dark.svg`,
`/icons/circlo-mark.svg`, `/icons/circlo-192.png`, `/icons/circlo-512.png`,
`/icons/circlo-maskable-512.png`.

## Follow-up work

1. Publish a trust page with the actual encryption design, device recovery limits,
   collected account/conversation/security metadata, and retention periods. The
   current server stores conversation membership: do not advertise that it cannot
   know who talks to whom. List independent audits only after they are completed.
2. Review licensing and repository visibility before advertising open-source status.
   Avoid competitor privacy comparisons without sourced, current evidence.
3. Prepare app-store screenshots using owned demo accounts, the dark palette, mint
   bubbles, and the tagline. Never include customer conversations.
4. Scope the proposed $3.99 Pro plan: billing, quota enforcement, cancellation,
   storage/bandwidth costs and abuse controls. 100GB storage and unlimited groups
   are proposals, not current entitlements. Validate unit economics first.
5. Prototype an optional one-shot circle animation around the sender avatar.
   Respect reduced motion, avoid layout changes, and verify composer latency before
   enabling it. Message sending must never wait for decoration.

This visual release does not add subscriptions, storage entitlements, audits, or
new encryption guarantees. Existing authentication and encryption controls remain
in force.
