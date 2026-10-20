# Settings and group photo follow-up

Profile and Settings now use progressive disclosure for account controls.
The ordinary device view shows a friendly name, current-device/trust status and
activity. User IDs and duplicate device identifiers no longer appear in the
account overview; raw user-agent strings are replaced by short labels.
Inactive registrations are omitted from the main signed-in list. No registered
keys, approvals, sessions or account data are deleted by this UI change.

Fingerprints remain in Security details and explicit approval comparisons.
Approval, fresh authentication, linking codes, recovery confirmations and backend
permissions are retained. Backup/restore and troubleshooting controls are closed
by default. Settings no longer fetches and renders a redundant list of key IDs.

Group settings puts the photo and basic identity first, with permissions and
rules in their own expandable section. Photo/settings mutation responses include
the persisted update timestamp. The chat header applies acknowledged metadata
immediately; group details reject older responses so an in-flight request cannot
restore a previous photo. Uploaded photos retain unique immutable URLs.

Browser regression coverage includes compact mobile defaults, optional security
details, approval/recovery, two successive photo uploads without reload, a delayed
old group-details response, persistence after reopening, mobile layouts, and
existing group membership/key-exclusion checks. No database migration, new paid
service, dependency or encryption/authentication weakening is required.
