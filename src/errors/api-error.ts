export interface ErrorDetail {
  field?: string;
  message: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly errors: ErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code = 'INTERNAL_ERROR',
    errors: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors: ErrorDetail[] = []) {
    return new ApiError(400, message, 'BAD_REQUEST', errors);
  }

  static unauthenticated(message = 'Authentication is required to access this resource.') {
    return new ApiError(401, message, 'UNAUTHENTICATED');
  }

  static unauthorized(message = 'Authentication is required.') {
    return new ApiError(401, message, 'UNAUTHENTICATED');
  }

  static tokenExpired(message = 'Your session or token has expired. Please log in again.') {
    return new ApiError(401, message, 'TOKEN_EXPIRED');
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static accountSuspended(message = 'Your account has been suspended. Please contact administration.') {
    return new ApiError(403, message, 'ACCOUNT_SUSPENDED');
  }

  static reauthRequired(message = 'Password re-authentication required for this administrative operation.') {
    return new ApiError(403, message, 'REAUTH_REQUIRED');
  }

  static notFound(resource = 'Resource') {
    return new ApiError(404, `${resource} was not found.`, 'NOT_FOUND');
  }

  static conflict(message: string, code = 'DUPLICATE') {
    return new ApiError(409, message, code);
  }

  static validation(errors: ErrorDetail[], message = 'Validation failed for one or more fields.') {
    return new ApiError(422, message, 'VALIDATION_ERROR', errors);
  }

  static rateLimited(message = 'Too many requests. Please slow down.', retryAfterSeconds?: number) {
    const error = new ApiError(429, message, 'RATE_LIMITED');
    if (retryAfterSeconds) {
      error.errors.push({ message: `Retry after ${retryAfterSeconds} seconds.` });
    }
    return error;
  }
}
