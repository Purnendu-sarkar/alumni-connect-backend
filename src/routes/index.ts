import { Router } from 'express';

import { prisma } from '../config/database.js';
import { isRedisHealthy } from '../config/redis.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { adminRouter } from './admin.routes.js';
import { alumniRouter } from './alumni.routes.js';
import { authRouter } from './auth.routes.js';
import { connectionRouter } from './connection.routes.js';
import { jobRouter } from './job.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

// Liveness probe
apiRouter.get('/healthz', (_request, response) =>
  sendSuccess(response, { data: { status: 'ok', service: 'alumni-connect-api' } }),
);

// Readiness probe: verifies PostgreSQL and Redis
apiRouter.get(
  '/readyz',
  asyncHandler(async (_request, response) => {
    let dbStatus = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    const redisReady = await isRedisHealthy();

    return sendSuccess(response, {
      data: {
        status: dbStatus === 'connected' ? 'ready' : 'degraded',
        database: dbStatus,
        redis: redisReady ? 'connected' : 'offline_fallback',
      },
    });
  }),
);

// Mount feature routes
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/alumni', alumniRouter);
apiRouter.use('/connections', connectionRouter);
apiRouter.use('/jobs', jobRouter);
apiRouter.use('/admin', adminRouter);
