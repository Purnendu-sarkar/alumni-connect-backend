import { Router } from 'express';

import { prisma } from '../config/database.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { adminRouter } from './admin.routes.js';
import { alumniRouter } from './alumni.routes.js';
import { authRouter } from './auth.routes.js';
import { connectionRouter } from './connection.routes.js';
import { jobRouter } from './job.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_request, response) =>
  sendSuccess(response, { data: { status: 'ok', service: 'alumni-connect-api' } }),
);
apiRouter.get(
  '/ready',
  asyncHandler(async (_request, response) => {
    await prisma.$queryRaw`SELECT 1`;
    return sendSuccess(response, { data: { status: 'ready', database: 'connected' } });
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/alumni', alumniRouter);
apiRouter.use('/connections', connectionRouter);
apiRouter.use('/jobs', jobRouter);
apiRouter.use('/admin', adminRouter);
