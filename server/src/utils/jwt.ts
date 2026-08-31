import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const AUTH_COOKIE = "maddy_token";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type JwtPayload = {
  sub: string; // user id
};

export function signAuthToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies JwtPayload, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function verifyAuthToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as JwtPayload).sub !== "string"
  ) {
    throw new Error("Malformed token payload");
  }
  return { sub: (decoded as JwtPayload).sub };
}

/**
 * Options for the HttpOnly auth cookie. Secure + SameSite=None in production so
 * it works across the proxied preview host; Lax in development.
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? ("none" as const) : ("lax" as const),
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  };
}
