# Database growth and query audit — 2026-10-11

Applied live: migration 0041, one non-unique partial index, built with CREATE INDEX CONCURRENTLY. Validity and exact definition checked; current size 16384 bytes. No tables, rows, encryption keys, query code, authentication or UI behavior were changed. No existing index was removed.

## What was inspected

The actual application database is Neon PostgreSQL 18.6, not Supabase Storage. pg_stat_statements is not installed/available; no extension was enabled and no statistics were reset. The code inventory contains 279 read sites (including action preconditions), and 94 important main-screen read shapes were measured before and after. The executable catalog preserves filters, joins and ordering; some projections use full rows rather than the application's smaller projection. Exact Drizzle chains and raw SQL appear in [the source inventory](read-source-inventory.md).

Authentication user/session/MFA reads run on authenticated requests. Conversation membership, peer keys, message hydration and realtime replay are the other frequent paths identified from code. Historical table activity shows roughly 1.68 million user-table sequential scans, 1.79 million membership scans, 1.67 million device-key scans, and 1.46 million history index scans. These are cumulative **table** counters, not per-query frequency or duration rankings; without pg_stat_statements, a reliable actual top-query ranking is unavailable.

At the current small message count, important ordinary reads are below 1 ms. The two slower measured reads are raw and compact encrypted-key recovery. Both use recipient-specific indexes, not full scans of the large history table. Additional indexes there would not fix the need to read existing historical key copies, and deleting/compacting keys could change recovery behavior; neither was done.

## Index accepted and query it supports

messages_undelivered_conversation_idx ON messages(conversation_id,sender_id) WHERE delivered_at IS NULL supports the SELECT in src/server/chat.ts:markDeliveredFor when the realtime stream connects. Conversation membership restricts the conversation join; sender_id excludes the user's own messages. The partial predicate keeps already-delivered history out of the index, limiting write/storage overhead. No wide message contents or extra covering columns were added.

| Delivery lookup | Before (ms) | After (ms) | Result |
|---|---:|---:|---|
| Live, current small database | 0.130 | 0.131 | No meaningful change; tiny-table scan remains cheaper |
| Isolated 500,000-message / 10,000-user scale fixture | 190.414 | 0.106 | Full messages scan replaced by partial-index lookup |

Scale timings are medians of 18 measured reads per condition over three alternating rollback/apply rounds, with warm-ups excluded. Returned rows matched across every round. These are database execution times, not end-to-end chat delivery latency or a concurrent-user capacity guarantee.

Rejected candidates: a mixed-direction latest-message index regressed a 500,000-message test from 15.757 to 35.939 ms. A signup-date index changed LIMIT-page membership when synthetic signup timestamps tied, exposing the existing lack of a secondary ORDER BY. Date-order index candidates were not applied; sorting behavior was preserved. No speculative message-text, role, attachment-kind or extra history index was added.

## Verification

- All 94 read-result fingerprints matched before/after in the controlled synthetic database.
- Actual application functions returned identical 12 screen DTO collections across apply and rollback: chats, conversation details, messages, starred messages, pins, media, files, links, statuses, notifications, privacy settings and profile. The fixture contains ciphertext and a selected-audience status; both were preserved.
- Apply, repeated apply, rollback, repeated rollback and reapply succeeded.
- Concurrent message retry regression passed: one message and one event per recipient, with accurate read receipts and unchanged ciphertext.
- 16 unit tests passed; TypeScript and targeted ESLint passed.
- Live same-snapshot delivery results matched with the index exercised. Index forcing was confined to a read-only diagnostic transaction; no production planner setting was changed. Private authenticated readiness returned HTTP 200.
- Live before/after snapshots are separated in time: 84/94 full-row fingerprints matched. 10 differ (conversation-members, chat-members, message-page, message-older-page, reply-messages, realtime-replay, message-search, status-feed, status-viewers, community-members). Nine involve joined users with mutable activity metadata, and replay uses a moving expiry/time window; these unfrozen snapshots are not used as a screen-equality proof. The controlled query and DTO tests provide that proof. No new full browser/UI walkthrough or concurrent-load capacity certification is claimed.

## Every measured live read

Five measured samples per query, one warm-up excluded; EXPLAIN ANALYZE ran inside read-only transactions, only on SELECTs. Reads inside write workflows were measured as separate SELECTs; INSERT/UPDATE/DELETE and locking reads were never explained. Full-table scans below are literal plan observations, including small joined tables. A sequential scan on a 42-row users table can be optimal; it does not mean every such table needs another index. Timing fluctuations on unchanged plans and cache-related history improvements are not attributed to the new index.

| Query | Screen | Before ms | After ms | Full scan before | Full scan after |
|---|---|---:|---:|---|---|
| session-user | All authenticated screens | 0.042 | 0.042 | Yes: users | Yes: users |
| session-device | All authenticated screens | 0.036 | 0.036 | Yes: device_sessions | Yes: device_sessions |
| session-mfa | All authenticated screens | 0.051 | 0.046 | No | No |
| memberships | Chats | 0.054 | 0.048 | Yes: conversation_members | Yes: conversation_members |
| conversation-list | Chats | 0.067 | 0.062 | Yes: conversations | Yes: conversations |
| conversation-members | Chats / conversation details | 0.110 | 0.108 | Yes: conversation_members, users | Yes: conversation_members, users |
| latest-messages | Chats | 0.692 | 0.676 | Yes: messages | Yes: messages |
| unread-counts | Chats | 0.273 | 0.297 | Yes: messages, message_reads | Yes: messages, message_reads |
| pinned-conversations | Chats | 0.052 | 0.051 | No | No |
| blocks | Chats / status | 0.041 | 0.042 | No | No |
| membership | Chat / encryption | 0.040 | 0.043 | Yes: conversation_members | Yes: conversation_members |
| conversation-detail | Chat | 0.056 | 0.054 | Yes: conversations | Yes: conversations |
| chat-members | Chat | 0.084 | 0.082 | Yes: users, conversation_members | Yes: users, conversation_members |
| message-page | Chat | 0.258 | 0.257 | Yes: messages, users | Yes: messages, users |
| message-older-page | Chat | 0.214 | 0.230 | Yes: messages, users | Yes: messages, users |
| message-reactions | Chat hydration | 0.054 | 0.058 | No | No |
| message-read-receipts | Chat hydration | 0.104 | 0.104 | Yes: message_reads | Yes: message_reads |
| message-attachments | Chat hydration | 0.052 | 0.053 | Yes: message_attachments | Yes: message_attachments |
| message-deletions | Chat hydration | 0.049 | 0.049 | No | No |
| message-stars | Chat hydration | 0.049 | 0.048 | No | No |
| reply-messages | Chat hydration | 0.209 | 0.193 | Yes: messages, users | Yes: messages, users |
| pins | Chat | 0.133 | 0.093 | Yes: messages | Yes: messages |
| scheduled-list | Chat | 0.063 | 0.063 | No | No |
| mark-read-selection | Chat (read portion only) | 0.202 | 0.210 | Yes: message_reads, messages | Yes: message_reads, messages |
| delivery-selection | Realtime connect (read portion only) | 0.130 | 0.131 | Yes: messages, conversation_members | Yes: messages, conversation_members |
| realtime-replay | All authenticated screens | 0.084 | 0.053 | Yes: realtime_events | Yes: realtime_events |
| people-recent | People / new chat | 0.082 | 0.089 | Yes: users | Yes: users |
| people-search | People / new chat | 0.072 | 0.072 | Yes: users | Yes: users |
| user-profile | User profile | 0.047 | 0.044 | Yes: users | Yes: users |
| direct-conversation | User profile / new chat | 0.058 | 0.055 | Yes: conversations | Yes: conversations |
| starred | Starred | 0.127 | 0.101 | Yes: messages | Yes: messages |
| media-deletions | Conversation media/files/links | 0.110 | 0.150 | No | Yes: messages |
| media | Conversation details | 0.170 | 0.179 | Yes: messages, message_attachments | Yes: messages, message_attachments |
| files | Conversation details | 0.077 | 0.071 | Yes: message_attachments | Yes: message_attachments |
| links | Conversation details | 0.517 | 0.508 | Yes: messages, users | Yes: messages, users |
| message-search | Chat search | 0.460 | 0.442 | Yes: messages, conversations, users | Yes: messages, conversations, users |
| status-feed | Status | 0.104 | 0.099 | Yes: statuses, users | Yes: statuses, users |
| status-recipients | Status | 0.042 | 0.044 | No | No |
| status-viewed | Status | 0.050 | 0.050 | No | No |
| status-view-counts | Status | 0.075 | 0.080 | No | No |
| status-reactions | Status | 0.054 | 0.053 | No | No |
| status-detail | Status viewer | 0.082 | 0.079 | Yes: users | Yes: users |
| status-viewers | Status viewer | 0.106 | 0.103 | Yes: users | Yes: users |
| notifications | Notification menu | 0.109 | 0.074 | No | No |
| notification-unread | Notification menu | 0.105 | 0.105 | No | No |
| privacy | Profile / settings | 0.045 | 0.045 | No | No |
| notification-preferences | Settings | 0.042 | 0.042 | Yes: notification_preferences | Yes: notification_preferences |
| login-history | Profile | 0.060 | 0.068 | Yes: login_history | Yes: login_history |
| device-sessions | Profile | 0.047 | 0.056 | Yes: device_sessions | Yes: device_sessions |
| encryption-devices | Profile / peers | 0.057 | 0.064 | Yes: e2ee_keys | Yes: e2ee_keys |
| device-link-requests | Profile | 0.044 | 0.041 | Yes: device_link_requests | Yes: device_link_requests |
| conversation-keys | Chat encryption | 0.248 | 0.247 | No | No |
| key-history-raw | Chat recovery | 38.949 | 13.246 | No | No |
| key-history-compact | Chat recovery | 21.924 | 22.697 | No | No |
| community-memberships | Communities | 0.049 | 0.051 | No | No |
| my-communities | Communities | 0.044 | 0.042 | No | No |
| public-communities | Communities | 0.043 | 0.042 | Yes: communities | Yes: communities |
| community-detail | Community | 0.053 | 0.041 | No | No |
| community-member-count | Community | 0.059 | 0.059 | No | No |
| channel-count | Community | 0.061 | 0.062 | No | No |
| channels | Community | 0.059 | 0.059 | No | No |
| community-members | Community | 0.113 | 0.114 | Yes: users | Yes: users |
| admin-users | Admin users | 0.074 | 0.075 | Yes: users | Yes: users |
| admin-messages | Admin messages | 0.555 | 0.542 | Yes: messages, users, conversations | Yes: messages, users, conversations |
| admin-messages-search | Admin messages | 0.358 | 0.347 | Yes: messages, users, conversations | Yes: messages, users, conversations |
| admin-message-search-count | Admin messages | 0.278 | 0.276 | Yes: messages | Yes: messages |
| reports | Admin reports | 0.069 | 0.073 | Yes: users | Yes: users |
| audit | Admin audit | 0.152 | 0.145 | Yes: admin_audit_log | Yes: admin_audit_log |
| admin-count-users | Admin overview | 0.055 | 0.057 | Yes: users | Yes: users |
| admin-count-messages | Admin overview | 0.164 | 0.143 | No | Yes: messages |
| admin-count-conversations | Admin overview | 0.063 | 0.077 | Yes: conversations | Yes: conversations |
| admin-active-1 | Admin overview | 0.058 | 0.058 | Yes: users | Yes: users |
| admin-active-7 | Admin overview | 0.058 | 0.060 | Yes: users | Yes: users |
| admin-active-30 | Admin overview | 0.064 | 0.061 | Yes: users | Yes: users |
| admin-recent-messages-1 | Admin overview | 0.136 | 0.117 | Yes: messages | Yes: messages |
| admin-recent-messages-7 | Admin overview | 0.124 | 0.120 | Yes: messages | Yes: messages |
| admin-banned-count | Admin overview | 0.058 | 0.059 | Yes: users | Yes: users |
| admin-group-count | Admin overview | 0.060 | 0.059 | Yes: conversations | Yes: conversations |
| admin-top-users | Admin overview | 0.490 | 0.405 | Yes: users | Yes: messages, users |
| admin-chart-users | Admin overview | 0.065 | 0.065 | Yes: users | Yes: users |
| admin-chart-messages | Admin overview | 0.159 | 0.146 | Yes: messages | Yes: messages |
| admin-activity-count | Admin activity | 0.157 | 0.155 | Yes: notifications | Yes: notifications |
| admin-activity | Admin activity | 0.481 | 0.478 | Yes: notifications, users | Yes: notifications, users |
| admin-activity-filter-count | Admin activity | 0.223 | 0.219 | Yes: notifications | Yes: notifications |
| admin-activity-filter | Admin activity | 0.526 | 0.511 | Yes: notifications, users | Yes: notifications, users |
| admin-storage-total | Admin storage | 0.063 | 0.068 | Yes: message_attachments | Yes: message_attachments |
| admin-storage-types | Admin storage | 0.073 | 0.081 | Yes: message_attachments | Yes: message_attachments |
| admin-storage-uploaders | Admin storage | 0.294 | 0.296 | Yes: messages, message_attachments | Yes: messages, message_attachments |
| admin-security-logins | Admin security | 0.057 | 0.056 | Yes: login_history | Yes: login_history |
| retention-messages-90 | Admin security | 0.118 | 0.119 | Yes: messages | Yes: messages |
| retention-messages-180 | Admin security | 0.110 | 0.122 | Yes: messages | Yes: messages |
| retention-attachments | Admin security | 0.056 | 0.055 | Yes: message_attachments | Yes: message_attachments |
| retention-scheduled | Admin security | 0.051 | 0.050 | Yes: scheduled_messages | Yes: scheduled_messages |
| retention-audit | Admin security | 0.053 | 0.053 | Yes: admin_audit_log | Yes: admin_audit_log |

## Existing indexes with zero recorded scans

28 indexes had idx_scan=0 at the initial snapshot, including 20 primary/unique indexes. The database stats-reset timestamp is unknown/null, so this cannot establish that an index has *never* been used. Unique/primary indexes still enforce integrity when scan counters are zero. Existing trigram indexes are useful for directory substring searches at larger data sizes even though the small live table currently prefers scanning. None was removed based only on a zero counter.

| Index | Table | Unique / primary constraint | Bytes | Definition |
|---|---|---|---:|---|
| blocks_pkey | blocks | Primary | 8192 | `CREATE UNIQUE INDEX blocks_pkey ON public.blocks USING btree (id)` |
| channels_community_id_name_key | channels | Unique | 16384 | `CREATE UNIQUE INDEX channels_community_id_name_key ON public.channels USING btree (community_id, name)` |
| community_members_pkey | community_members | Primary | 16384 | `CREATE UNIQUE INDEX community_members_pkey ON public.community_members USING btree (id)` |
| conversations_last_message_idx | conversations | No — monitor workload before removal | 16384 | `CREATE INDEX conversations_last_message_idx ON public.conversations USING btree (last_message_at)` |
| e2ee_signal_devices_protocol_address_unique | e2ee_signal_devices | Unique | 16384 | `CREATE UNIQUE INDEX e2ee_signal_devices_protocol_address_unique ON public.e2ee_signal_devices USING btree (user_id, protocol_device_id) WHERE (protocol_device_id IS NOT NULL)` |
| e2ee_signal_envelopes_pkey | e2ee_signal_envelopes | Primary | 8192 | `CREATE UNIQUE INDEX e2ee_signal_envelopes_pkey ON public.e2ee_signal_envelopes USING btree (id)` |
| fcm_tokens_pkey | fcm_tokens | Primary | 8192 | `CREATE UNIQUE INDEX fcm_tokens_pkey ON public.fcm_tokens USING btree (id)` |
| fcm_tokens_token_key | fcm_tokens | Unique | 8192 | `CREATE UNIQUE INDEX fcm_tokens_token_key ON public.fcm_tokens USING btree (token)` |
| group_invite_links_code_key | group_invite_links | Unique | 16384 | `CREATE UNIQUE INDEX group_invite_links_code_key ON public.group_invite_links USING btree (code)` |
| group_invite_links_pkey | group_invite_links | Primary | 16384 | `CREATE UNIQUE INDEX group_invite_links_pkey ON public.group_invite_links USING btree (id)` |
| login_history_created_idx | login_history | No — monitor workload before removal | 16384 | `CREATE INDEX login_history_created_idx ON public.login_history USING btree (created_at)` |
| login_history_pkey | login_history | Primary | 16384 | `CREATE UNIQUE INDEX login_history_pkey ON public.login_history USING btree (id)` |
| message_deletions_pkey | message_deletions | Primary | 16384 | `CREATE UNIQUE INDEX message_deletions_pkey ON public.message_deletions USING btree (id)` |
| message_mentions_pkey | message_mentions | Primary | 8192 | `CREATE UNIQUE INDEX message_mentions_pkey ON public.message_mentions USING btree (id)` |
| message_stars_pkey | message_stars | Primary | 16384 | `CREATE UNIQUE INDEX message_stars_pkey ON public.message_stars USING btree (id)` |
| password_reset_tokens_pkey | password_reset_tokens | Primary | 8192 | `CREATE UNIQUE INDEX password_reset_tokens_pkey ON public.password_reset_tokens USING btree (id)` |
| password_reset_tokens_token_hash_key | password_reset_tokens | Unique | 8192 | `CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash)` |
| pinned_messages_pkey | pinned_messages | Primary | 8192 | `CREATE UNIQUE INDEX pinned_messages_pkey ON public.pinned_messages USING btree (id)` |
| playing_with_neon_pkey | playing_with_neon | Primary | 16384 | `CREATE UNIQUE INDEX playing_with_neon_pkey ON public.playing_with_neon USING btree (id)` |
| push_subscriptions_pkey | push_subscriptions | Primary | 16384 | `CREATE UNIQUE INDEX push_subscriptions_pkey ON public.push_subscriptions USING btree (id)` |
| scheduled_messages_scheduled_idx | scheduled_messages | No — monitor workload before removal | 16384 | `CREATE INDEX scheduled_messages_scheduled_idx ON public.scheduled_messages USING btree (scheduled_for)` |
| scheduled_messages_sent_idx | scheduled_messages | No — monitor workload before removal | 16384 | `CREATE INDEX scheduled_messages_sent_idx ON public.scheduled_messages USING btree (sent)` |
| status_reactions_pkey | status_reactions | Primary | 16384 | `CREATE UNIQUE INDEX status_reactions_pkey ON public.status_reactions USING btree (id)` |
| users_display_name_trgm_idx | users | No — monitor workload before removal | 49152 | `CREATE INDEX users_display_name_trgm_idx ON public.users USING gin (display_name gin_trgm_ops)` |
| users_role_idx | users | No — monitor workload before removal | 16384 | `CREATE INDEX users_role_idx ON public.users USING btree (role)` |
| users_suspended_idx | users | No — monitor workload before removal | 16384 | `CREATE INDEX users_suspended_idx ON public.users USING btree (suspended_at) WHERE (suspended_at IS NOT NULL)` |
| users_username_trgm_idx | users | No — monitor workload before removal | 73728 | `CREATE INDEX users_username_trgm_idx ON public.users USING gin (username gin_trgm_ops)` |
| users_username_unique | users | Unique | 16384 | `CREATE UNIQUE INDEX users_username_unique ON public.users USING btree (username)` |

## Capacity limits that indexes cannot remove

The database occupies 494.8 MiB. Encryption-key history contains approximately 548,756 rows and occupies 479.0 MiB including its indexes — about 97% of current database storage. This optimization does not increase storage quotas or server capacity. Substantial growth still needs verified storage headroom and workload/load testing. Historical keys were retained to preserve existing decryption and recovery. No paid resource was provisioned and no retention policy was changed. Full-feed status delivery and exact global admin counts/aggregates also intrinsically grow with data; adding indexes indiscriminately would not remove that work.

## Review, reproduce and undo

See [online migration instructions](online-migrations.md), the [read source inventory](read-source-inventory.md), executable SQL shapes in scripts/database-read-catalog.mjs, and [redacted live plans and timing samples](live-read-plans.json). The concurrent up/down SQL is in drizzle/online/, deliberately outside the transactional Drizzle journal. Do not run it inside a transaction. The application service did not require a redeploy for an index-only database change.
