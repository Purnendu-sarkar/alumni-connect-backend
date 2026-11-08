import { Router } from 'express';
import { Role } from '@prisma/client';

import { adminPresenter } from '../presenters/admin.presenter.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { requireReauth } from '../middlewares/reauth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  inviteAdminSchema,
  reviewVerificationSchema,
  userIdParamSchema,
  verificationQuerySchema,
} from '../validators/admin.schema.js';

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole(Role.SUPER_ADMIN));

// Invitations (Moderator / Super Admin) - sensitive: requires 15-min reauth
adminRouter.post(
  '/invitations',
  requireReauth,
  validate(inviteAdminSchema),
  adminPresenter.inviteUser,
);

adminRouter.get(
  '/verifications',
  validate(verificationQuerySchema, 'query'),
  adminPresenter.listVerifications,
);

// Review verification is a sensitive action: requires 15-minute reauth window
adminRouter.patch(
  '/users/:userId/verification',
  requireReauth,
  validate(userIdParamSchema, 'params'),
  validate(reviewVerificationSchema),
  adminPresenter.reviewVerification,
);

adminRouter.get('/stats', adminPresenter.getStats);
adminRouter.get('/audit-logs', adminPresenter.listAuditLogs);
