import { Router } from 'express';

import { PERMISSIONS } from '../constants/permissions.js';
import { adminController } from '../controllers/admin.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission, requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  adminUsersQuerySchema,
  adminSettingsSchema,
  auditLogQuerySchema,
  broadcastNotificationSchema,
  changeUserRoleSchema,
  invitationIdParamSchema,
  inviteModeratorSchema,
  removeModeratorSchema,
  reviewVerificationSchema,
  toggleSuspensionSchema,
  updateAdminUserSchema,
  userIdParamSchema,
  verificationQuerySchema,
} from '../validators/admin.schema.js';

export const adminRouter = Router();

adminRouter.use(authenticate);

// User Management Roster, Detail, Edit, Role & Security Endpoints (SUPER_ADMIN)
adminRouter.get(
  '/users',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(adminUsersQuerySchema, 'query'),
  adminController.listUsers,
);

adminRouter.get(
  '/users/:userId',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.getUserDetail,
);

adminRouter.patch(
  '/users/:userId',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(updateAdminUserSchema),
  adminController.updateUserByAdmin,
);

adminRouter.patch(
  '/users/:userId/role',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(changeUserRoleSchema),
  adminController.changeUserRole,
);

adminRouter.post(
  '/users/:userId/send-reset',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.sendPasswordResetByAdmin,
);

adminRouter.delete(
  '/users/:userId/sessions',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.terminateUserSessions,
);

// Verification Queue Endpoints (SUPER_ADMIN)
adminRouter.get(
  '/verifications',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(verificationQuerySchema, 'query'),
  adminController.listVerifications,
);

adminRouter.patch(
  '/users/:userId/verification',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(reviewVerificationSchema),
  adminController.reviewVerification,
);

adminRouter.post(
  '/users/:userId/verification',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(reviewVerificationSchema),
  adminController.reviewVerification,
);

adminRouter.patch(
  '/users/:userId/verify',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.verifyUser,
);

adminRouter.post(
  '/users/:userId/verify',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  adminController.verifyUser,
);

// User Suspension / Restoration Endpoints (SUPER_ADMIN)
adminRouter.patch(
  '/users/:userId/status',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.USER_VERIFY),
  validate(userIdParamSchema, 'params'),
  validate(toggleSuspensionSchema),
  adminController.toggleUserSuspension,
);

// Moderator Roster, Removal & Invitation Endpoints (SUPER_ADMIN)
adminRouter.get(
  '/moderators',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listModerators,
);

adminRouter.post(
  '/moderators/:userId/remove',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(userIdParamSchema, 'params'),
  validate(removeModeratorSchema),
  adminController.removeModerator,
);

adminRouter.post(
  '/moderators/invite',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(inviteModeratorSchema),
  adminController.inviteModerator,
);

adminRouter.get(
  '/moderators/invitations',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listModeratorInvitations,
);

adminRouter.post(
  '/moderators/invitations/:id/resend',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(invitationIdParamSchema, 'params'),
  adminController.resendModeratorInvitation,
);

adminRouter.delete(
  '/moderators/invitations/:id',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(invitationIdParamSchema, 'params'),
  adminController.revokeModeratorInvitation,
);

// Roles & Permissions Matrix + Super Admin Roster (SUPER_ADMIN)
adminRouter.get(
  '/roles',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.getRolesOverview,
);

adminRouter.get(
  '/admins',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listAdmins,
);

// System Audit Logs & Statistics (SUPER_ADMIN)
adminRouter.get(
  '/audit-logs',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate(auditLogQuerySchema, 'query'),
  adminController.listAuditLogs,
);

adminRouter.get(
  '/stats',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  adminController.getStats,
);

// Platform & University Management Endpoints
adminRouter.get(
  '/universities',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.listUniversities,
);

adminRouter.post(
  '/universities',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.createUniversity,
);

adminRouter.patch(
  '/universities/:id/status',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.toggleUniversityStatus,
);

// System Governance Settings Endpoints
adminRouter.get(
  '/settings',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.getSettings,
);

adminRouter.patch(
  '/settings',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(adminSettingsSchema),
  adminController.updateSettings,
);

// System Broadcast Notification Endpoints
adminRouter.post(
  '/notifications/broadcast',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  validate(broadcastNotificationSchema),
  adminController.broadcastNotification,
);

adminRouter.get(
  '/notifications/broadcasts',
  requireRole('SUPER_ADMIN'),
  requirePermission(PERMISSIONS.UNIVERSITY_MANAGE),
  adminController.getBroadcastHistory,
);
