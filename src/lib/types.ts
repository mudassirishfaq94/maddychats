/**
 * Shape of a user as exposed to its owner. `passwordHash` is intentionally
 * absent — it must never leave the server.
 */
export interface SafeUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

/**
 * Public profile shape shown to OTHER users (search results, profile views).
 * Note: no email — that is private to the account owner.
 */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  lastSeenAt: string | null;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface ApiFieldErrors {
  [field: string]: string;
}

/* ------------------------------ chat (Step 3) ------------------------------ */

export interface ReactionGroup {
  emoji: string;
  count: number;
  /** Whether the requesting user reacted with this emoji. */
  mine: boolean;
  userIds: string[];
}

export interface ReplyPreview {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  deleted: boolean;
}

export interface ReadReceipt {
  userId: string;
  readAt: string;
}

export interface AttachmentDTO {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: "image" | "video" | "file";
  /** Authenticated media endpoint — never a raw filesystem path. */
  url: string;
}

export interface SearchHit {
  message: {
    id: string;
    text: string;
    createdAt: string;
    conversationId: string;
  };
  conversation: { id: string; name: string | null };
  sender: PublicUser;
}

export interface MessageDTO {
  id: string;
  conversationId: string;
  /** Empty string once soft-deleted; clients render "Message deleted". */
  text: string;
  type: string;
  senderId: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deliveredAt: string | null;
  replyToMessageId: string | null;
  replyTo: ReplyPreview | null;
  reactions: ReactionGroup[];
  /** Reads by OTHER members (the sender's own read is implicit). */
  readBy: ReadReceipt[];
  attachments: AttachmentDTO[];
  sender: PublicUser;
  /** Per-viewer state: whether this viewer starred the message. */
  starred: boolean;
  /** Per-viewer state: whether this message is deleted for this viewer. */
  deletedForMe: boolean;
  /** Conversation-level state: whether the message is pinned. */
  pinned: boolean;
}

export interface ConversationSummary {
  id: string;
  type: "dm" | "group";
  name: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  /** The other participant (direct chats). */
  otherMember: PublicUser | null;
  /** Messages from others this viewer hasn't read yet. */
  unreadCount: number;
  /** Per-user conversation state (never shared between participants). */
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  markedUnread: boolean;
  /** True when either side has blocked the other. */
  blocked: boolean;
  /** Whether any messages are pinned in this conversation. */
  hasPinnedMessages: boolean;
  lastMessage: {
    id: string;
    text: string;
    type: string;
    senderId: string;
    createdAt: string;
    deletedAt: string | null;
  } | null;
}

export interface ConversationDetail {
  id: string;
  type: "dm" | "group";
  name: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  members: PublicUser[];
}

export interface MessagePage {
  /** Chronological order (oldest → newest) for direct rendering. */
  messages: MessageDTO[];
  /** Cursor to fetch the next OLDER page; null when no more history. */
  nextCursor: string | null;
  hasMore: boolean;
}

/* --------------------------- realtime (Step 4) ---------------------------
 * Event contract pushed to clients over the realtime stream. Shaped like
 * Socket.IO events so the transport can be swapped later without touching
 * UI logic. */
export interface RealtimeMessageEvent {
  type: "message:new" | "message:update" | "message:deleted";
  conversationId: string;
  message: MessageDTO;
}

export interface RealtimePinnedEvent {
  type: "message:pinned" | "message:unpinned";
  conversationId: string;
  messageId: string;
  pinnedBy?: string;
}

export interface RealtimeDeleteForMeEvent {
  type: "message:deleted_for_me";
  conversationId: string;
  messageId: string;
}

export interface RealtimeConversationEvent {
  type: "conversation:new" | "conversation:delete";
  conversationId: string;
}

export interface RealtimePresenceEvent {
  type: "presence:update";
  userId: string;
  online: boolean;
  lastSeenAt: string | null;
}

export interface RealtimeReadEvent {
  type: "message:read";
  conversationId: string;
  userId: string;
  messageIds: string[];
  readAt: string;
}

export interface RealtimeDeliveredEvent {
  type: "message:delivered";
  conversationId: string;
  messageIds: string[];
  deliveredAt: string;
}

export interface NotificationDTO {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actorId: string | null;
}

export interface RealtimeNotificationEvent {
  type: "notification:new";
  notification: NotificationDTO;
}

export interface RealtimeTypingEvent {
  type: "typing:update";
  conversationId: string;
  userId: string;
  typing: boolean;
}

export type RealtimeEvent =
  | RealtimeMessageEvent
  | RealtimeConversationEvent
  | RealtimePresenceEvent
  | RealtimeReadEvent
  | RealtimeDeliveredEvent
  | RealtimeNotificationEvent
  | RealtimeTypingEvent
  | RealtimePinnedEvent
  | RealtimeDeleteForMeEvent;

/** Presence snapshot delivered on connect and via presence:update. */
export interface PresenceState {
  [userId: string]: { online: boolean; lastSeenAt: string | null };
}
