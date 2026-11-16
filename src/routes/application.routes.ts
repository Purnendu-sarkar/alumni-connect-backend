import { Router } from 'express';

import { applicationController } from '../controllers/application.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  applicationParamsSchema,
  withdrawApplicationSchema,
} from '../validators/job.schema.js';

export const applicationRouter = Router();

applicationRouter.use(authenticate);

// Candidate gets list of own job applications
applicationRouter.get('/my', applicationController.getMyApplications);

// Job owner gets all received applications across all jobs
applicationRouter.get('/received', applicationController.getReceivedApplications);

// Get application detail
applicationRouter.get(
  '/:id',
  validate(applicationParamsSchema, 'params'),
  applicationController.getDetail,
);

// Candidate withdraws application
applicationRouter.patch(
  '/:id/withdraw',
  validate(applicationParamsSchema, 'params'),
  validate(withdrawApplicationSchema),
  applicationController.withdraw,
);

// Authorized party downloads/accesses private resume (time-limited signed URL)
applicationRouter.get(
  '/:id/resume',
  validate(applicationParamsSchema, 'params'),
  applicationController.getSignedResume,
);
