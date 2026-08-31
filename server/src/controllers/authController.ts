import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/errors.js";
import { toPublicUser } from "../utils/user.js";
import {
  AUTH_COOKIE,
  authCookieOptions,
  signAuthToken,
} from "../utils/jwt.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
} from "../utils/validation.js";

const BCRYPT_ROUNDS = 12;

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { displayName, username, email, password } =
      req.body as RegisterInput;

    // Enforce uniqueness with clear, field-scoped conflicts.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      const fields: Record<string, string> = {};
      if (existing.email === email) fields.email = "That email is already registered.";
      if (existing.username === username)
        fields.username = "That username is already taken.";
      throw ApiError.conflict("An account with those details already exists.", {
        fields,
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: { displayName, username, email, passwordHash },
    });

    const token = signAuthToken(user.id);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { identifier, password } = req.body as LoginInput;
    const normalized = identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: normalized }, { username: normalized }] },
    });

    // Uniform error to avoid revealing which accounts exist.
    const invalid = ApiError.unauthorized("Invalid credentials.");
    if (!user) {
      // Still run a hash comparison to reduce timing signal.
      await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinva");
      throw invalid;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw invalid;

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const token = signAuthToken(user.id);
    res.cookie(AUTH_COOKIE, token, authCookieOptions());
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
}

export async function logout(_req: Request, res: Response) {
  const opts = authCookieOptions();
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
  res.status(200).json({ success: true });
}

export async function me(req: Request, res: Response) {
  // requireAuth guarantees req.user is present.
  res.status(200).json({ user: req.user });
}

/**
 * Forgot password (V1). We honestly do NOT send email — no email provider is
 * configured. We always return a neutral, generic response so we neither leak
 * which emails exist nor pretend a mail was delivered.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = req.body as ForgotPasswordInput;
    void email; // Intentionally unused: no email delivery is configured in V1.

    res.status(200).json({
      success: true,
      emailConfigured: false,
      message:
        "Password reset is not yet available. Email delivery is not configured in this version.",
    });
  } catch (err) {
    next(err);
  }
}
