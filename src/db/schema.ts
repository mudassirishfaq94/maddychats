import { relations, sql } from "drizzle-orm";
import {
  index,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ================================ users ================================ */

/**
 * Maddy Chats — core identity table.
 * `passwordHash` holds a bcrypt hash and must NEVER be selected into API
 * responses (see `toSafeUser` / `toPublicUser` in src/server/users.ts).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
    /**
     * Sessions issued BEFORE this instant are revoked (logout kills every
     * outstanding token for the account, not just one browser tab).
     */
    tokenInvalidBeforeAt: timestamp("token_invalid_before_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    uniqueIndex("users_username_lower_unique").on(sql`lower(${table.username})`),
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("oauth_accounts_provider_account_unique").on(table.provider, table.providerAccountId),
    index("oauth_accounts_user_idx").on(table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

/** Short-lived cross-instance event queue used by Vercel realtime streams. */
export const realtimeEvents = pgTable(
  "realtime_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("realtime_events_user_created_idx").on(table.userId, table.createdAt)],
);

/* ==================== chat-ready models (prepared now) ==================== */

export const conversationTypeEnum = pgEnum("conversation_type", [
  "dm",
  "group",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: conversationTypeEnum("type").default("dm").notNull(),
    /** Group-only display name; null for direct messages. */
    name: text("name"),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    /**
     * Race-safe de-dup key for 1:1 chats: `dm:<lowerUserId>:<higherUserId>`.
     * The unique constraint guarantees no duplicate direct conversations even
     * under concurrent creates. Null for groups.
     */
    dmKey: text("dm_key").unique(),
    createdById: uuid("created_by_id")
      .references(() => users.id, { onDelete: "set null" }),
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
      mode: "date",
    }),
    /** Chat background style key (e.g. 'ocean', 'forest', 'midnight', or custom URL/color). */
    backgroundStyle: text("background_style"),
    /** Background opacity 0.0–1.0 (controls intensity of patterns/images). */
    backgroundOpacity: integer("background_opacity").default(100),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** Group deletion tombstone; preserves message history for retention/audit. */
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [index("conversations_last_message_idx").on(table.lastMessageAt)],
);

export const conversationMembers = pgTable(
  "conversation_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** owner | admin | member */
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    /** Null only for a pending direct-message request recipient. */
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }),
    /* ---- per-user conversation state ------------------------------------
     * These are deliberately per-member so one user pinning/archiving or
     * "deleting" a chat never mutates the other participant's view. */
    pinnedAt: timestamp("pinned_at", { withTimezone: true, mode: "date" }),
    mutedAt: timestamp("muted_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    /** Soft "delete for me": hides history up to this point for this user. */
    clearedAt: timestamp("cleared_at", { withTimezone: true, mode: "date" }),
    /** Manual "mark unread" flag, cleared when the chat is opened again. */
    markedUnreadAt: timestamp("marked_unread_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    unique("conversation_members_conv_user_unique").on(
      table.conversationId,
      table.userId,
    ),
    index("conversation_members_user_idx").on(table.userId),
    index("conversation_members_conversation_idx").on(table.conversationId),
  ],
);

export const messageMentions = pgTable(
  "message_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("message_mentions_message_user_unique").on(table.messageId, table.userId),
    index("message_mentions_user_idx").on(table.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    text: text("text").notNull(),
    /** text | image | file … — drives message rendering. */
    type: text("type").default("text").notNull(),
    /** Threaded reply target; nulled if the original is hard-deleted. */
    replyToMessageId: uuid("reply_to_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    /** Set once any other member is connected — powers the "Delivered" tick. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true, mode: "date" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index("messages_sender_idx").on(table.senderId),
  ],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("message_reactions_message_user_emoji_unique").on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
    index("message_reactions_message_idx").on(table.messageId),
  ],
);

export const messageReads = pgTable(
  "message_reads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("message_reads_message_user_unique").on(
      table.messageId,
      table.userId,
    ),
    index("message_reads_user_idx").on(table.userId),
  ],
);

/**
 * Message attachments — metadata ONLY. Binary content lives on the local
 * filesystem under server/uploads/**; PostgreSQL stores the pointer.
 */
export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    /** Sanitized display name — never used to build a filesystem path. */
    originalName: text("original_name").notNull(),
    /** Server-generated, collision-free filename actually written to disk. */
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    /** Path relative to the uploads root, e.g. "images/ab12….webp". */
    path: text("path").notNull(),
    /** image | file */
    kind: text("kind").default("file").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("message_attachments_message_idx").on(table.messageId)],
);

/* ================= message stars (per-user) ================= */

export const messageStars = pgTable(
  "message_stars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("message_stars_message_user_unique").on(
      table.messageId,
      table.userId,
    ),
    index("message_stars_user_idx").on(table.userId),
  ],
);

/* ================= pinned messages (conversation-level) ================= */

export const pinnedMessages = pgTable(
  "pinned_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    pinnedBy: uuid("pinned_by")
      .references(() => users.id, { onDelete: "set null" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("pinned_messages_conversation_message_unique").on(
      table.conversationId,
      table.messageId,
    ),
    index("pinned_messages_conversation_idx").on(table.conversationId),
  ],
);

/* ================= message deletions (per-user) ================= */

export const messageDeletions = pgTable(
  "message_deletions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("message_deletions_message_user_unique").on(
      table.messageId,
      table.userId,
    ),
    index("message_deletions_user_idx").on(table.userId),
  ],
);

/* ================= social models (blocks, notifications) ================= */

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    blockerId: uuid("blocker_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    blockedId: uuid("blocked_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("blocks_blocker_blocked_unique").on(table.blockerId, table.blockedId),
    index("blocks_blocked_idx").on(table.blockedId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Recipient. */
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    /** User who triggered it, when applicable. */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** message | mention | system | … */
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.readAt),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ],
);

/** One row per user; absent legacy rows resolve to these enabled defaults. */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  messageNotifications: boolean("message_notifications").default(true).notNull(),
  groupNotifications: boolean("group_notifications").default(true).notNull(),
  pushNotifications: boolean("push_notifications").default(true).notNull(),
  notificationSound: boolean("notification_sound").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/* ======================== temporary status updates ======================== */

export const statusTypeEnum = pgEnum("status_type", ["text", "image", "video"]);
export const statusPrivacyEnum = pgEnum("status_privacy", ["all", "selected"]);

export const statuses = pgTable(
  "statuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    type: statusTypeEnum("type").notNull(),
    text: text("text"),
    mediaPath: text("media_path"),
    mediaMimeType: text("media_mime_type"),
    backgroundStyle: text("background_style"),
    privacy: statusPrivacyEnum("privacy").default("all").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("statuses_user_created_idx").on(table.userId, table.createdAt), index("statuses_expires_idx").on(table.expiresAt)],
);

export const statusViews = pgTable(
  "status_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "cascade" }).notNull(),
    viewerId: uuid("viewer_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("status_views_status_viewer_unique").on(table.statusId, table.viewerId), index("status_views_viewer_idx").on(table.viewerId)],
);

export const statusRecipients = pgTable(
  "status_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  },
  (table) => [unique("status_recipients_status_user_unique").on(table.statusId, table.userId), index("status_recipients_user_idx").on(table.userId)],
);

export const statusReactions = pgTable(
  "status_reactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique("status_reactions_status_user_unique").on(table.statusId, table.userId), index("status_reactions_status_idx").on(table.statusId)],
);

/* ================================ relations ============================== */

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(conversationMembers),
  messages: many(messages),
  reactions: many(messageReactions),
  reads: many(messageReads),
  stars: many(messageStars),
  messageDeletions: many(messageDeletions),
  blocking: many(blocks, { relationName: "blocker" }),
  blockedBy: many(blocks, { relationName: "blocked" }),
  notifications: many(notifications, { relationName: "notificationRecipient" }),
  mentions: many(messageMentions),
  triggeredNotifications: many(notifications, {
    relationName: "notificationActor",
  }),
}));

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    createdBy: one(users, {
      fields: [conversations.createdById],
      references: [users.id],
    }),
    members: many(conversationMembers),
    messages: many(messages),
  }),
);

export const conversationMembersRelations = relations(
  conversationMembers,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMembers.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationMembers.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  reactions: many(messageReactions),
  reads: many(messageReads),
  attachments: many(messageAttachments),
  stars: many(messageStars),
  pinnedIn: many(pinnedMessages),
  deletions: many(messageDeletions),
  mentions: many(messageMentions),
}));

export const messageMentionsRelations = relations(messageMentions, ({ one }) => ({
  message: one(messages, {
    fields: [messageMentions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageMentions.userId],
    references: [users.id],
  }),
}));

export const messageAttachmentsRelations = relations(
  messageAttachments,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageAttachments.messageId],
      references: [messages.id],
    }),
  }),
);

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  }),
);

export const messageReadsRelations = relations(messageReads, ({ one }) => ({
  message: one(messages, {
    fields: [messageReads.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReads.userId],
    references: [users.id],
  }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  blocker: one(users, {
    fields: [blocks.blockerId],
    references: [users.id],
    relationName: "blocker",
  }),
  blocked: one(users, {
    fields: [blocks.blockedId],
    references: [users.id],
    relationName: "blocked",
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notificationRecipient",
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: "notificationActor",
  }),
}));

export const messageStarsRelations = relations(messageStars, ({ one }) => ({
  message: one(messages, {
    fields: [messageStars.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageStars.userId],
    references: [users.id],
  }),
}));

export const pinnedMessagesRelations = relations(pinnedMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [pinnedMessages.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [pinnedMessages.messageId],
    references: [messages.id],
  }),
  pinner: one(users, {
    fields: [pinnedMessages.pinnedBy],
    references: [users.id],
  }),
}));

export const messageDeletionsRelations = relations(messageDeletions, ({ one }) => ({
  message: one(messages, {
    fields: [messageDeletions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageDeletions.userId],
    references: [users.id],
  }),
}));

/* ================================== types ================================ */

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ConversationRow = typeof conversations.$inferSelect;
export type ConversationMemberRow = typeof conversationMembers.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MessageReactionRow = typeof messageReactions.$inferSelect;
export type MessageReadRow = typeof messageReads.$inferSelect;
export type BlockRow = typeof blocks.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type NotificationPreferenceRow = typeof notificationPreferences.$inferSelect;
export type MessageAttachmentRow = typeof messageAttachments.$inferSelect;
export type MessageStarRow = typeof messageStars.$inferSelect;
export type PinnedMessageRow = typeof pinnedMessages.$inferSelect;
export type MessageDeletionRow = typeof messageDeletions.$inferSelect;
export type MessageMentionRow = typeof messageMentions.$inferSelect;
export type StatusRow = typeof statuses.$inferSelect;
export type RealtimeEventRow = typeof realtimeEvents.$inferSelect;
