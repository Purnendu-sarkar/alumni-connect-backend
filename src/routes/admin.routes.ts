import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  auditLogQuerySchema,
  invitationIdParamSchema,
  inviteModeratorSchema,
  reviewVerificationSchema,
  toggleSuspensionSchema,
  userIdParamSchema,
  verificationQuerySchema,
} from '../validators/admin.schema.js';

export const adminRouter = Router();

adminRouter.use(authenticate);

// Verification Queue Endpoints
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

// User Suspension / Restoration Endpoints
adminRouter.patch(
  '/users/:userId/status',
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(toggleSuspensionSchema),
  adminController.toggleUserSuspension,
);

// Moderator Invitation & Management Endpoints (Super Admin Only)
adminRouter.post(
  '/moderators/invite',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(inviteModeratorSchema),
  adminController.inviteModerator,
);

adminRouter.get(
  '/moderators/invitations',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listModeratorInvitations,
);

adminRouter.post(
  '/moderators/invitations/:id/resend',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(invitationIdParamSchema, 'params'),
  adminController.resendModeratorInvitation,
);

adminRouter.delete(
  '/moderators/invitations/:id',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(invitationIdParamSchema, 'params'),
  adminController.revokeModeratorInvitation,
);

// System Audit Logs & Statistics (Super Admin / Analytics Read Permission Required)
adminRouter.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate(auditLogQuerySchema, 'query'),
  adminController.listAuditLogs,
);

adminRouter.get(
  '/stats',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  adminController.getStats,
);

// Platform & University Management Endpoints
adminRouter.get(
  '/universities',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listUniversities,
);

adminRouter.post(
  '/universities',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.createUniversity,
);

adminRouter.patch(
  '/universities/:id/status',
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.toggleUniversityStatus,
);

