import pino from 'pino';

import { env } from './index.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: null,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'res.headers.set-cookie',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }
    : {}),
});
