import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/errors.js";
import { env } from "../config/env.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
}

/**
 * Global error handler. Emits safe, structured JSON. Unexpected errors are
 * logged server-side but never leaked to the client.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // next is required for Express to treat this as an error handler.
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unknown / unexpected error.
  console.error("[unhandled error]", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
      ...(env.isProduction
        ? {}
        : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
