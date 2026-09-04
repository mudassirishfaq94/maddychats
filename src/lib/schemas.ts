import { z } from "zod";

/**
 * Shared request-validation schemas. Safe for BOTH the client bundle and the
 * server — no Node-only imports live here.
 */

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must be at least 2 characters")
      .max(50, "Display name must be 50 characters or fewer"),
    username: z
      .string()
      .trim()
      .regex(USERNAME_PATTERN, "3–20 characters: letters, numbers, underscores only"),
    email: z
      .email("Enter a valid email address")
      .max(254, "Email address is too long"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be 72 characters or fewer")
      .regex(/[a-z]/, "Password is too weak — add a lowercase letter")
      .regex(/[A-Z]/, "Password is too weak — add an uppercase letter")
      .regex(/[0-9]/, "Password is too weak — add a number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username"),
  password: z.string().min(1, "Enter your password"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(32, "This reset link is invalid"),
    password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be 72 characters or fewer").regex(/[a-z]/, "Add a lowercase letter").regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

/**
 * Profile edit payload — at least one field required. Empty bio clears it.
 */
export const profileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Display name must be at least 2 characters")
      .max(50, "Display name must be 50 characters or fewer")
      .optional(),
    username: z
      .string()
      .trim()
      .regex(USERNAME_PATTERN, "3–20 characters: letters, numbers, underscores only")
      .optional(),
    bio: z
      .string()
      .trim()
      .max(160, "Bio must be 160 characters or fewer")
      .optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

export const MAX_BIO_LENGTH = 160;
export const MAX_MESSAGE_LENGTH = 2000;

/** Start (or resume) a direct conversation with a user id. */
export const startConversationSchema = z.object({
  userId: z.uuid("Invalid user id"),
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(100, "Group name must be 100 characters or fewer"),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").optional().default(""),
  memberIds: z.array(z.uuid("Invalid member id")).min(1, "Select at least one person").max(255, "A group can have at most 256 members"),
});

export const groupMemberSchema = z.object({ userId: z.uuid("Invalid user id") });
export const groupRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export const transferOwnershipSchema = z.object({ userId: z.uuid("Invalid user id") });

export const sendMessageSchema = z.object({
  // When E2EE is active the client sends ciphertext (base64), which is longer
  // than the plaintext limit — so allow up to 4x while the client still caps
  // plaintext at MAX_MESSAGE_LENGTH.
  text: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH * 4, "Encrypted message payload is invalid"),
  replyToMessageId: z.uuid("Invalid message id").nullish(),
  forwarded: z.boolean().optional().default(false),
  encrypted: z.boolean().optional().default(false),
});

export const editMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH * 4, "Encrypted message payload is invalid"),
  encrypted: z.boolean().optional().default(false),
});

/** Emoji reactions — short grapheme strings only. */
export const reactionSchema = z.object({
  emoji: z
    .string()
    .trim()
    .min(1, "Pick an emoji")
    .max(16, "That reaction is too long"),
});

export const notificationPreferencesSchema = z
  .object({
    messageNotifications: z.boolean().optional(),
    groupNotifications: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    notificationSound: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one preference to update",
  });

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export const REACTION_CHOICES = ["👍", "❤️", "😂", "🎉", "😮", "😢"] as const;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Flattens a ZodError into a `{ field: message }` map (first issue wins). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
