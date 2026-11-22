import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission, requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { reportController } from '../controllers/report.controller.js';
import {
  adminLiftRestrictionSchema,
  adminOverturnReportSchema,
  adminReassignReportSchema,
  createReportSchema,
  moderatorRejectReportSchema,
  moderatorReportQuerySchema,
  moderatorResolveReportSchema,
  reportIdParamSchema,
} from '../validators/report.schema.js';

// Base User Reports Router: POST /api/v1/reports
export const reportRouter = Router();
reportRouter.use(authenticate);

reportRouter.post(
  '/',
  validate(createReportSchema, 'body'),
  reportController.submitReport,
);

// Moderator Reports Router: /api/v1/moderator/reports
export const moderatorReportRouter = Router();
moderatorReportRouter.use(authenticate);
moderatorReportRouter.use(requirePermission(PERMISSIONS.REPORT_REVIEW));

moderatorReportRouter.get(
  '/',
  validate(moderatorReportQuerySchema, 'query'),
  reportController.getModeratorReports,
);

moderatorReportRouter.get(
  '/:id',
  validate(reportIdParamSchema, 'params'),
  reportController.getReportById,
);

moderatorReportRouter.post(
  '/:id/claim',
  validate(reportIdParamSchema, 'params'),
  reportController.claimReport,
);

moderatorReportRouter.post(
  '/:id/resolve',
  validate(reportIdParamSchema, 'params'),
  validate(moderatorResolveReportSchema, 'body'),
  reportController.resolveReport,
);

moderatorReportRouter.post(
  '/:id/reject',
  validate(reportIdParamSchema, 'params'),
  validate(moderatorRejectReportSchema, 'body'),
  reportController.rejectReport,
);

moderatorReportRouter.post(
  '/:id/escalate',
  validate(reportIdParamSchema, 'params'),
  reportController.escalateReport,
);

// Super Admin Reports Router: /api/v1/admin/reports
export const adminReportRouter = Router();
adminReportRouter.use(authenticate);
adminReportRouter.use(requireRole('SUPER_ADMIN'));

adminReportRouter.get(
  '/',
  validate(moderatorReportQuerySchema, 'query'),
  reportController.getModeratorReports,
);

adminReportRouter.get(
  '/:id',
  validate(reportIdParamSchema, 'params'),
  reportController.getReportById,
);

adminReportRouter.post(
  '/:id/take-over',
  validate(reportIdParamSchema, 'params'),
  reportController.takeOverReport,
);

adminReportRouter.post(
  '/:id/reassign',
  validate(reportIdParamSchema, 'params'),
  validate(adminReassignReportSchema, 'body'),
  reportController.reassignReport,
);

adminReportRouter.post(
  '/:id/resolve',
  validate(reportIdParamSchema, 'params'),
  validate(moderatorResolveReportSchema, 'body'),
  reportController.resolveReport,
);

adminReportRouter.post(
  '/:id/reject',
  validate(reportIdParamSchema, 'params'),
  validate(moderatorRejectReportSchema, 'body'),
  reportController.rejectReport,
);

adminReportRouter.post(
  '/:id/overturn',
  validate(reportIdParamSchema, 'params'),
  validate(adminOverturnReportSchema, 'body'),
  reportController.overturnReport,
);

// Super Admin Restrictions Router: /api/v1/admin/restrictions
export const adminRestrictionRouter = Router();
adminRestrictionRouter.use(authenticate);
adminRestrictionRouter.use(requireRole('SUPER_ADMIN'));

adminRestrictionRouter.delete(
  '/:id',
  validate(reportIdParamSchema, 'params'),
  validate(adminLiftRestrictionSchema, 'body'),
  reportController.liftRestriction,
);
