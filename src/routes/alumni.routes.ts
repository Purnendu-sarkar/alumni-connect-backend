import { Router } from 'express';
import { z } from 'zod';

import { alumniController } from '../controllers/alumni.controller.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { alumniQuerySchema } from '../validators/alumni.schema.js';

const alumniIdParamSchema = z.object({ id: z.string().min(1, 'Alumni ID is required.') });

export const alumniRouter = Router();

alumniRouter.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.ALUMNI_READ),
  validate(alumniQuerySchema, 'query'),
  alumniController.list,
);

alumniRouter.get(
  '/:id',
  authenticate,
  requirePermission(PERMISSIONS.ALUMNI_READ),
  validate(alumniIdParamSchema, 'params'),
  alumniController.getById,
);
