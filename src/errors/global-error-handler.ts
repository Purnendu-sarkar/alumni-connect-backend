import type { ErrorRequestHandler } from 'express';

import { Prisma } from '../generated/prisma/client.js';
import { env } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from './api-error.js';

interface BodyParserError extends SyntaxError {
  status?: number;
}

export const globalErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);

  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as BodyParserError).status === 400
  ) {
    apiError = ApiError.badRequest('Invalid JSON syntax provided.');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : '';
    apiError = ApiError.conflict(target.includes('email') ? 'An account with this email already exists.' : 'A record with one of these values already exists.');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    apiError = ApiError.notFound('Resource');
  } else {
    apiError = new ApiError(500, 'An unexpected error occurred.', 'INTERNAL_ERROR');
  }

  // Attach sanitized error details to request for concise HTTP request summary
  request.errorContext = {
    code: apiError.code,
    message: apiError.message,
    isOperational: apiError.isOperational,
  };

  // Only emit full error stack traces for unexpected programmer/system errors (5xx)
  if (!apiError.isOperational || apiError.statusCode >= 500) {
    logger.error(
      {
        err: error,
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: apiError.statusCode,
      },
      `[ERROR] Server Error: ${apiError.message}`,
    );
  }

  return response.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    error: {
      code: apiError.code,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
      ...(env.NODE_ENV === 'production' || apiError.isOperational ? {} : { stack: error.stack }),
    },
    requestId: request.requestId,
  });
};
