import type { ErrorRequestHandler } from 'express';

import { Prisma } from '../generated/prisma/client.js';
import { env } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from './api-error.js';

export const globalErrorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) return next(error);

  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : '';
    apiError = ApiError.conflict(target.includes('email') ? 'An account with this email already exists.' : 'A record with one of these values already exists.');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    apiError = ApiError.notFound('Resource');
  } else {
    apiError = new ApiError(500, 'An unexpected error occurred.', 'INTERNAL_ERROR');
  }

  logger.error(
    {
      err: error,
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: apiError.statusCode,
    },
    apiError.message,
  );

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
