import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { ApiError } from '../errors/api-error.js';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodType, part: RequestPart = 'body'): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request[part]);
    if (!parsed.success) {
      return next(
        new ApiError(422, 'Validation failed.', 'VALIDATION_ERROR', parsed.error.flatten()),
      );
    }

    Object.assign(request, { [part]: parsed.data });
    return next();
  };
}
