import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { jobModerationController } from '../controllers/job-moderation.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { adminOverrideSchema, jobIdParamSchema } from '../validators/job.schema.js';

export const adminJobRouter = Router();

adminJobRouter.use(authenticate);

// Super admin global jobs list
adminJobRouter.get(
  '/',
  requirePermission(PERMISSIONS.JOB_REVIEW),
  jobModerationController.getAdminJobs,
);

// Super admin moderation override
adminJobRouter.post(
  '/:id/override',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(jobIdParamSchema, 'params'),
  validate(adminOverrideSchema),
  jobModerationController.adminOverride,
);
