import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../utils/errors.js";
import { AUTH_COOKIE, verifyAuthToken } from "../utils/jwt.js";
import { toPublicUser, type PublicUser } from "../utils/user.js";

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

/**
 * Authentication middleware. Reads the JWT from the HttpOnly cookie (falling
 * back to a Bearer header), verifies it, loads the user, and attaches a
 * sanitized public user to the request. Rejects unauthenticated requests.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const cookieToken = req.cookies?.[AUTH_COOKIE] as string | undefined;
    const header = req.headers.authorization;
    const bearer =
      header && header.startsWith("Bearer ") ? header.slice(7) : undefined;
    const token = cookieToken ?? bearer;

    if (!token) {
      throw ApiError.unauthorized();
    }

    let payload;
    try {
      payload = verifyAuthToken(token);
    } catch {
      throw ApiError.unauthorized("Your session is invalid or has expired.");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw ApiError.unauthorized("Your session is invalid or has expired.");
    }

    req.user = toPublicUser(user);
    next();
  } catch (err) {
    next(err);
  }
}
