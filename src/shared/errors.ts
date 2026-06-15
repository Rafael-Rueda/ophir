/**
 * Application error hierarchy. Each error maps to an HTTP status code and a
 * stable machine-readable code that matches the `ErrorResponse` contract.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "bad_request", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication failed or missing", details?: unknown) {
    super(401, "unauthorized", message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied", details?: unknown) {
    super(403, "forbidden", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(404, "not_found", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: unknown) {
    super(409, "conflict", message, details);
  }
}

export class CollectorUnavailableError extends AppError {
  constructor(message = "Telemetry could not be forwarded to the Collector", details?: unknown) {
    super(502, "collector_unavailable", message, details);
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", details?: unknown) {
    super(500, "internal_error", message, details);
  }
}

/** Shape returned to clients, matching the OpenAPI `ErrorResponse`. */
export interface ErrorResponseBody {
  error: { code: string; message: string };
  requestId: string;
}

export function toErrorResponse(error: AppError, requestId: string): ErrorResponseBody {
  return {
    error: { code: error.code, message: error.message },
    requestId,
  };
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
