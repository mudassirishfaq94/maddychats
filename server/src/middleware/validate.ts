import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors.js";

/**
 * Validate and normalize `req.body` against a Zod schema. On success the parsed
 * (and normalized) value replaces `req.body`. On failure a 400 with structured,
 * field-level errors is thrown — never leaking internals.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.errors) {
          const key = issue.path.join(".") || "form";
          if (!fieldErrors[key]) fieldErrors[key] = issue.message;
        }
        next(
          ApiError.badRequest("Please correct the highlighted fields.", {
            fields: fieldErrors,
          })
        );
        return;
      }
      next(err);
    }
  };
}
