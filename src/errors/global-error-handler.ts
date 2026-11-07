import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';

import { env } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from './api-error.js';

export const globalErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);

  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : 'field';
      apiError = ApiError.conflict(`A record with this ${target} already exists.`, 'DUPLICATE');
    } else if (error.code === 'P2025') {
      apiError = ApiError.notFound('Requested resource');
    } else {
      apiError = new ApiError(400, 'Database query conflict or constraint violation.', 'INVALID_STATE');
    }
  } else if (error?.name === 'JsonWebTokenError') {
    apiError = ApiError.unauthenticated('Invalid authentication token.');
  } else if (error?.name === 'TokenExpiredError') {
    apiError = ApiError.tokenExpired();
  } else {
    logger.error(
      {
        err: error,
        requestId: request.requestId,
        path: request.originalUrl,
        method: request.method,
      },
      'Unhandled system exception caught by global error middleware.',
    );
    apiError = new ApiError(500, 'An unexpected server error occurred.', 'INTERNAL_ERROR');
  }

  // Exact SSOT JSON response format
  return response.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    code: apiError.code,
    errors: apiError.errors ?? [],
    ...(env.NODE_ENV !== 'production' && !apiError.isOperational ? { stack: error.stack } : {}),
  });
};
