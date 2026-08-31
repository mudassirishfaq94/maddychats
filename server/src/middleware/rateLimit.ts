import rateLimit from "express-rate-limit";

/**
 * Rate limiter for authentication endpoints. Protects against brute-force and
 * credential-stuffing. Returns a safe, structured error when tripped.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 attempts per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait a few minutes and try again.",
      },
    });
  },
});
