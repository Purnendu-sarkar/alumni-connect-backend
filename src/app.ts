import path from 'node:path';
import express, { type RequestHandler, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { corsOrigins, env } from './config/index.js';
import { logger } from './config/logger.js';
import { globalErrorHandler } from './errors/global-error-handler.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { apiRouter } from './routes/index.js';

export const app = express();

const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();
  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs,
      },
      'Request completed',
    );
  });
  next();
};

app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('This origin is not allowed by CORS.'));
    },
    credentials: true,
    maxAge: 86_400,
  }),
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(cookieParser(env.SESSION_SECRET));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Root informational endpoint
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'AlumniConnect Single-University API is operational.',
    institution: env.INSTITUTION_NAME,
    environment: env.NODE_ENV,
    uptime: process.uptime().toFixed(2) + 's',
    timestamp: new Date().toISOString(),
  });
});

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Standard SSOT Internal REST API base
app.use('/api', apiRouter);
// Backward compatibility alias
app.use('/api/v1', apiRouter);

app.use(notFoundMiddleware);
app.use(globalErrorHandler);
