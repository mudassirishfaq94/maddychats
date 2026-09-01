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
      .max(72, "Password must be 72 characters or fewer"),
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

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH, "Message must be 2000 characters or fewer"),
  replyToMessageId: z.uuid("Invalid message id").nullish(),
});

export const editMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(MAX_MESSAGE_LENGTH, "Message must be 2000 characters or fewer"),
});

/** Emoji reactions — short grapheme strings only. */
export const reactionSchema = z.object({
  emoji: z
    .string()
    .trim()
    .min(1, "Pick an emoji")
    .max(16, "That reaction is too long"),
});

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
