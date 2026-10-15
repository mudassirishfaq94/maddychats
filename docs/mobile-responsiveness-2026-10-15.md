# Android-first layout follow-up

The recovery buttons overflowed because the shared .btn style forced nowrap
labels, including inside deeply nested profile cards. Ordinary page-width tests
missed these because the app shell intentionally clips horizontal overflow.

Buttons now wrap with readable line height and respect their available width.
Coarse-pointer buttons have a 44px minimum hit area; the reusable switch keeps
its original track and thumb within a larger focusable button. Form controls can
shrink within flex/grid parents. Narrow recovery cards use less nested padding.
Privacy selects and authenticator enrollment stack on small screens.

Account deletion and reporting use portals so animated ancestor cards cannot
constrain fixed dialog positioning. Confirmation, community, scheduling and
encryption dialogs have viewport-bounded, scrollable bodies. Confirmation
footers wrap rather than compress their labels. Voice bubbles have bounded,
shrinkable widths; their controls wrap and retain touch-sized playback targets.
Group names can wrap even without spaces. The legal-page header can wrap its
actions. The admin reports filter wraps; the closed admin drawer is invisible
and unfocusable, and its navigation can scroll in short landscape viewports.

The new local-only mobile layout audit checks public/authentication pages,
main application screens, expanded profile/security/recovery, group editing,
creation and destructive confirmation dialogs, and actual MFA-protected admin
pages. It uses disposable accounts, real MFA setup/login, long unbroken names,
320/360/390/412px phones, tablet/landscape, reduced-height layouts and larger
text. It inspects control rectangles and label widths, 44px touch targets,
scroll reachability and hit testing, while distinguishing modal background
controls and intentional horizontally scrollable tables. Dialog confirmation
buttons are trial-clicked without submitting destructive actions.

Existing real audio, encrypted media, voice recording/playback, long-history
composer, group editing/key exclusion and recovery workflows remain regression
coverage. Voice playback controls also get explicit 320–412px bounds checks.
The broad audit runs in the normal restored-workflow CI suite. No schema,
authentication, encryption protocol, dependencies or paid resources change.

Artifacts are written under .freebuff/performance/mobile-layout-before.json,
mobile-layout-after.json and mobile-recovery-320.png. Headless Chromium emulates
Android touch/viewport conditions; a physical handset and its native keyboard
still require manual acceptance testing. These checks do not prove every
possible screen size, browser or interaction is bug-free.

The initial focused audit covered 175 screen/layout states with zero layout
observations and zero browser errors. Build, lint and all 61 unit tests passed.

Emoji cells use an adaptive 44px grid and swipeable category tabs. Compact
touch chats keep their existing long-press action sheet instead of overflowing
hover controls; wider touch layouts reserve space for the larger control row.

Encrypted file downloads have a dedicated 44px link target and an explicit
real-browser check that message actions cannot intercept the download tap.

The compact long-press menu retains Edit, Star/Unstar and Pin/Unpin alongside
reply, forwarding, reactions, reporting and deletion, using the existing server
authorization and encrypted edit handlers.

The expanded audit covers 196 states. The media picker measures its anchor
before paint, preventing fallback placement from briefly hiding its tabs above
the viewport in landscape.
