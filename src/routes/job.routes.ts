import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { applicationController } from '../controllers/application.controller.js';
import { jobController } from '../controllers/job.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { requireTenant, resolveTenant } from '../middlewares/tenant.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { paginationQuerySchema } from '../utils/pagination.js';
import {
  applyJobSchema,
  closeJobSchema,
  createJobSchema,
  jobAndAppParamsSchema,
  jobIdParamSchema,
  jobQuerySchema,
  reviewJobSchema,
  updateApplicationStatusSchema,
  updateJobSchema,
} from '../validators/job.schema.js';

export const jobRouter = Router();

// Search & List published jobs (public or authenticated)
jobRouter.get(
  '/',
  resolveTenant,
  requireTenant,
  validate(jobQuerySchema, 'query'),
  jobController.searchJobs,
);

// Get current user's posted jobs or candidate applications
jobRouter.get(
  '/mine',
  authenticate,
  jobController.listMine,
);

// Moderator pending queue (backward compatibility)
jobRouter.get(
  '/pending',
  authenticate,
  requirePermission(PERMISSIONS.JOB_REVIEW),
  validate(paginationQuerySchema, 'query'),
  jobController.listPending,
);

// Create new job posting (Alumni, Super Admin)
jobRouter.post(
  '/',
  authenticate,
  requirePermission(PERMISSIONS.JOB_CREATE),
  validate(createJobSchema),
  jobController.create,
);

// Get single job detail by ID
jobRouter.get(
  '/:id',
  validate(jobIdParamSchema, 'params'),
  jobController.getById,
);

// Get job owner view (with applicant counts and moderation history)
jobRouter.get(
  '/:id/owner-view',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.getOwnerView,
);

// Update existing job posting
jobRouter.patch(
  '/:id',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  validate(updateJobSchema),
  jobController.update,
);

// Submit draft or changes-requested job to moderation
jobRouter.post(
  '/:id/submit',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.submit,
);

// Withdraw submission back to draft before claimed
jobRouter.post(
  '/:id/withdraw',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.withdraw,
);

// Duplicate job into a new draft
jobRouter.post(
  '/:id/duplicate',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.duplicate,
);

// Close an active job
jobRouter.patch(
  '/:id/close',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  validate(closeJobSchema),
  jobController.close,
);

// Soft-delete job (Draft, Rejected, or Closed with 0 apps)
jobRouter.delete(
  '/:id',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  jobController.delete,
);

// Candidate application submission
jobRouter.post(
  '/:id/applications',
  authenticate,
  requirePermission(PERMISSIONS.JOB_APPLY),
  validate(jobIdParamSchema, 'params'),
  validate(applyJobSchema),
  applicationController.apply,
);

// Job owner lists applicants for a specific job
jobRouter.get(
  '/:id/applications',
  authenticate,
  validate(jobIdParamSchema, 'params'),
  applicationController.getJobApplications,
);

// Job owner updates a candidate's application status
jobRouter.patch(
  '/:jobId/applications/:id/status',
  authenticate,
  validate(jobAndAppParamsSchema, 'params'),
  validate(updateApplicationStatusSchema),
  applicationController.updateStatus,
);

// Legacy review route (backward-compatible)
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
