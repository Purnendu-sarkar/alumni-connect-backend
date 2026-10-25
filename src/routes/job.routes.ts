import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { jobController } from '../controllers/job.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { requireTenant, resolveTenant } from '../middlewares/tenant.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { paginationQuerySchema } from '../utils/pagination.js';
import {
  applyJobSchema,
  createJobSchema,
  jobIdParamSchema,
  jobQuerySchema,
  reviewJobSchema,
} from '../validators/job.schema.js';

export const jobRouter = Router();

jobRouter.get(
  '/',
  resolveTenant,
  requireTenant,
  validate(jobQuerySchema, 'query'),
  jobController.listPublished,
);
jobRouter.get(
  '/pending',
  authenticate,
  requirePermission(PERMISSIONS.JOB_REVIEW),
  validate(paginationQuerySchema, 'query'),
  jobController.listPending,
);
jobRouter.get(
  '/mine',
  authenticate,
  jobController.listMine,
);
jobRouter.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.JOB_CREATE),
  validate(createJobSchema),
  jobController.create,
);
jobRouter.get(
  '/:id',
  validate(jobIdParamSchema, 'params'),
  jobController.getById,
);
jobRouter.patch(
  '/:id/review',
  authenticate,
  requirePermission(PERMISSIONS.JOB_REVIEW),
  validate(jobIdParamSchema, 'params'),
  validate(reviewJobSchema),
  jobController.review,
);
jobRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission(PERMISSIONS.JOB_REVIEW),
  validate(jobIdParamSchema, 'params'),
  validate(reviewJobSchema),
  jobController.review,
);
jobRouter.post(
  '/:id/applications',
  authenticate,
  requirePermission(PERMISSIONS.JOB_APPLY),
  validate(jobIdParamSchema, 'params'),
  validate(applyJobSchema),
  jobController.apply,
);
