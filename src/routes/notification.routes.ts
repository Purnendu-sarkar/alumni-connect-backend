import { Router } from 'express';

import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  updateNotificationPreferencesSchema,
} from '../validators/notification.schema.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

// Unread count fast-badge endpoint
notificationRouter.get('/unread-count', notificationController.getUnreadCount);

// Preferences endpoints (must be defined before /:id param route)
notificationRouter.get('/preferences', notificationController.getPreferences);
notificationRouter.patch(
  '/preferences',
  validate(updateNotificationPreferencesSchema),
  notificationController.updatePreferences,
);

// Bulk actions
notificationRouter.patch('/read-all', notificationController.markAllAsRead);

// List notifications
notificationRouter.get(
  '/',
  validate(notificationListQuerySchema, 'query'),
  notificationController.listNotifications,
);

// Individual notification actions
notificationRouter.patch(
  '/:id/read',
  validate(notificationIdParamSchema, 'params'),
  notificationController.markAsRead,
);
notificationRouter.delete(
  '/:id',
  validate(notificationIdParamSchema, 'params'),
  notificationController.deleteNotification,
);
