import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { jobPresenter } from '../presenters/job.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  applyJobSchema,
  createJobSchema,
  jobIdParamSchema,
  moderateJobSchema,
} from '../validators/job.schema.js';

export const jobRouter = Router();

jobRouter.use(authenticate);

jobRouter.get('/', jobPresenter.listActiveJobs);
jobRouter.post('/', validate(createJobSchema), jobPresenter.createJob);
jobRouter.get('/:id', validate(jobIdParamSchema, 'params'), jobPresenter.getJobById);
jobRouter.post(
  '/:id/apply',
  validate(jobIdParamSchema, 'params'),
  validate(applyJobSchema),
  jobPresenter.applyToJob,
);
jobRouter.patch(
  '/:id/moderate',
  requirePermission(PERMISSIONS.JOB_MODERATE),
  validate(jobIdParamSchema, 'params'),
  validate(moderateJobSchema),
  jobPresenter.moderateJob,
);
