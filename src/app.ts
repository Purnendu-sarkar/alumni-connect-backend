import path from 'node:path';
import express, { type RequestHandler, type Request, type Response } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000, 
}

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);


app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'AlumniConnect API is running successfully!',
    environment: config.env,
    uptime: process.uptime().toFixed(2) + 'sec',
    timeStamp: new Date().toUTCString(),
  });
});

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.use('/api/v1', apiRouter);
app.use(notFoundMiddleware);
app.use(globalErrorHandler);
