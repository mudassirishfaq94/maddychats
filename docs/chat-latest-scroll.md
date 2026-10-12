# Open chats at the latest message

The chat previously scrolled to the bottom on mount, then a separate effect centered the first unread message. Ordinary entry now opens at the latest message while retaining the unread separator. Initial layout positioning happens before paint; a coalesced ResizeObserver follows message and viewport size changes while the user remains at the bottom, covering decryption, loaded images, intrinsic history sizing and composer/window resizing.

Wheel/touch/keyboard scrolling and explicit message jumps release bottom following. Returning to the bottom or using Latest messages resumes it. Specific-message links and pinned/reply jumps retain their destination; notification latest links scroll once rather than resetting the position for every history update. Native browser anchoring and existing older-page offset restoration are retained.

The browser regression uses only disposable owned accounts/conversations: real encrypted wrapped messages, unread fixture history, delayed decryption, 320px/390px/landscape/desktop entry, intentional older-history scrolling through resize, Latest messages and explicit older-message links. Exact fixture IDs are removed afterward. No shared cache, database migration, authentication or encryption changes are required.
