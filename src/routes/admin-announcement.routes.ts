import { Router } from 'express';

import { adminAnnouncementController } from '../controllers/admin-announcement.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  adminAnnouncementQuerySchema,
  announcementIdParamSchema,
  createAnnouncementSchema,
  togglePinSchema,
  updateAnnouncementSchema,
} from '../validators/announcement.schema.js';

export const adminAnnouncementRouter = Router();

// List announcements for administration (Super Admin & Moderator)
adminAnnouncementRouter.get(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(adminAnnouncementQuerySchema, 'query'),
  adminAnnouncementController.list
);

// Create announcement (Super Admin)
adminAnnouncementRouter.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(createAnnouncementSchema),
  adminAnnouncementController.create
);

// Get announcement detail for administration (Super Admin & Moderator)
adminAnnouncementRouter.get(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.getById
);

// Update announcement (Super Admin)
adminAnnouncementRouter.patch(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  validate(updateAnnouncementSchema),
  adminAnnouncementController.update
);

// Publish announcement (Super Admin)
adminAnnouncementRouter.post(
  '/:id/publish',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.publish
);

// Archive announcement (Super Admin)
adminAnnouncementRouter.post(
  '/:id/archive',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.archive
);

// Restore announcement to draft (Super Admin)
adminAnnouncementRouter.post(
  '/:id/restore',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.restore
);

// Pin / Unpin announcement (Super Admin)
adminAnnouncementRouter.patch(
  '/:id/pin',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  validate(togglePinSchema),
  adminAnnouncementController.togglePin
);

// Duplicate announcement (Super Admin)
adminAnnouncementRouter.post(
  '/:id/duplicate',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.duplicate
);

// Delete announcement (Super Admin)
adminAnnouncementRouter.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(announcementIdParamSchema, 'params'),
  adminAnnouncementController.delete
);
