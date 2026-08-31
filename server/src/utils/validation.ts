import { z } from "zod";

const password = z
  .string({ required_error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

export const registerSchema = z
  .object({
    displayName: z
      .string({ required_error: "Display name is required." })
      .trim()
      .min(1, "Display name is required.")
      .max(60, "Display name must be at most 60 characters."),
    username: z
      .string({ required_error: "Username is required." })
      .trim()
      .toLowerCase()
      .min(3, "Username must be at least 3 characters.")
      .max(30, "Username must be at most 30 characters.")
      .regex(
        /^[a-z0-9_]+$/,
        "Username may only contain lowercase letters, numbers and underscores."
      ),
    email: z
      .string({ required_error: "Email is required." })
      .trim()
      .toLowerCase()
      .email("Please enter a valid email address."),
    password,
    confirmPassword: z.string({
      required_error: "Password confirmation is required.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  // Accept either email or username in the identifier field.
  identifier: z
    .string({ required_error: "Email or username is required." })
    .trim()
    .min(1, "Email or username is required."),
  password: z
    .string({ required_error: "Password is required." })
    .min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "Email is required." })
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
