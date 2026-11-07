import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { ApiError } from '../errors/api-error.js';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodType, part: RequestPart = 'body'): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request[part]);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(ApiError.validation(errors));
    }

    Object.defineProperty(request, part, {
      value: parsed.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    return next();
  };
}
