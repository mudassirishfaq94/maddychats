/**
 * Application error with an HTTP status code and a stable, client-safe code.
 * Throwing this anywhere in the request pipeline yields a structured,
 * non-leaky JSON error response via the global error handler.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "You do not have access to this resource.") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found.") {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", message, details);
  }
}
