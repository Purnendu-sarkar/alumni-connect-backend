import type { RequestHandler } from 'express';

import { ApiError } from '../errors/api-error.js';

export const notFoundMiddleware: RequestHandler = (request, _response, next) => {
  next(
    new ApiError(404, `Route ${request.method} ${request.originalUrl} was not found.`, 'NOT_FOUND'),
  );
};
