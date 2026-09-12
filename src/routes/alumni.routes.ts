import { Router } from 'express';

import { alumniController } from '../controllers/alumni.controller.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { alumniQuerySchema } from '../validators/alumni.schema.js';

export const alumniRouter = Router();

alumniRouter.get(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.ALUMNI_READ),
  validate(alumniQuerySchema, 'query'),
  alumniController.list,
);
