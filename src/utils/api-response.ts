import type { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface SuccessOptions<T> {
  statusCode?: number;
  message?: string;
  data?: T;
  meta?: PageMeta;
}

export function sendSuccess<T>(response: Response, options: SuccessOptions<T> = {}): Response {
  const { statusCode = 200, message = 'Success', data, meta } = options;

  return response.status(statusCode).json({
    success: true,
    message,
    ...(data === undefined ? {} : { data }),
    ...(meta === undefined ? {} : { meta }),
  });
}
