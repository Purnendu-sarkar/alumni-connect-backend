import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  reviewVerificationSchema,
  userIdParamSchema,
  verificationQuerySchema,
} from '../validators/admin.schema.js';

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get(
  '/verifications',
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(verificationQuerySchema, 'query'),
  adminController.listVerifications,
);

adminRouter.patch(
  '/users/:userId/verification',
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(reviewVerificationSchema),
  adminController.reviewVerification,
);

adminRouter.patch(
  '/users/:userId/verify',
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.verifyUser,
);
