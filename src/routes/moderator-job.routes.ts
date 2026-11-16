import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { jobModerationController } from '../controllers/job-moderation.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  jobIdParamSchema,
  moderationQueueQuerySchema,
  moderatorRejectSchema,
  moderatorRequestChangesSchema,
} from '../validators/job.schema.js';

export const moderatorJobRouter = Router();

moderatorJobRouter.use(authenticate);
moderatorJobRouter.use(requirePermission(PERMISSIONS.JOB_REVIEW));

// Paginated moderation queue with status, category, and q filters
moderatorJobRouter.get(
  '/',
  validate(moderationQueueQuerySchema, 'query'),
  jobModerationController.getQueue,
);

// Get full job inspection view with risk hints and history
moderatorJobRouter.get(
  '/:id',
  validate(jobIdParamSchema, 'params'),
  jobModerationController.getDetail,
);

// Atomic claim job for review
moderatorJobRouter.post(
  '/:id/claim',
  validate(jobIdParamSchema, 'params'),
  jobModerationController.claim,
);

// Release claim back to queue
moderatorJobRouter.post(
  '/:id/unclaim',
  validate(jobIdParamSchema, 'params'),
  jobModerationController.unclaim,
);

// Approve and publish listing to campus board
moderatorJobRouter.post(
  '/:id/approve',
  validate(jobIdParamSchema, 'params'),
  jobModerationController.approve,
);

// Decline listing with mandatory feedback
moderatorJobRouter.post(
  '/:id/reject',
  validate(jobIdParamSchema, 'params'),
  validate(moderatorRejectSchema),
  jobModerationController.reject,
);

// Request changes with actionable feedback
moderatorJobRouter.post(
  '/:id/request-changes',
  validate(jobIdParamSchema, 'params'),
  validate(moderatorRequestChangesSchema),
  jobModerationController.requestChanges,
);
