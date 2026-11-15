import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { getRateLimitStore } from '../config/redis.js';
import { directoryController } from '../controllers/directory.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { directoryMemberParamSchema, directoryQuerySchema } from '../validators/directory.schema.js';

export const directoryRouter = Router();

const directoryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: getRateLimitStore('dir'),
  message: {
    success: false,
    message: 'Directory search rate limit exceeded. Please slow down your queries.',
    code: 'TOO_MANY_REQUESTS',
  },
});

directoryRouter.use(authenticate);
// Strictly restricted to STUDENT and ALUMNI roles (blocking MODERATOR and SUPER_ADMIN with 403 FORBIDDEN)
directoryRouter.use(requireRole('STUDENT', 'ALUMNI'));
directoryRouter.use(directoryRateLimiter);

directoryRouter.get('/', validate(directoryQuerySchema, 'query'), directoryController.search);
directoryRouter.get('/:id', validate(directoryMemberParamSchema, 'params'), directoryController.getById);
