import { Router } from 'express';

import { adminEventController } from '../controllers/admin-event.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  adminEventQuerySchema,
  cancelEventSchema,
  createEventSchema,
  eventAttendeesQuerySchema,
  eventIdParamSchema,
  updateEventSchema,
} from '../validators/event.schema.js';

export const adminEventRouter = Router();

// List events for administration (Super Admin & Moderator)
adminEventRouter.get(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(adminEventQuerySchema, 'query'),
  adminEventController.list
);

// Create event (Super Admin)
adminEventRouter.post(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(createEventSchema),
  adminEventController.create
);

// Get event administration detail (Super Admin & Moderator)
adminEventRouter.get(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(eventIdParamSchema, 'params'),
  adminEventController.getById
);

// Update event (Super Admin)
adminEventRouter.patch(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  validate(updateEventSchema),
  adminEventController.update
);

// Publish event (Super Admin)
adminEventRouter.post(
  '/:id/publish',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  adminEventController.publish
);

// Cancel event (Super Admin)
adminEventRouter.post(
  '/:id/cancel',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  validate(cancelEventSchema),
  adminEventController.cancel
);

// Complete event (Super Admin)
adminEventRouter.post(
  '/:id/complete',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  adminEventController.complete
);

// Duplicate event (Super Admin)
adminEventRouter.post(
  '/:id/duplicate',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  adminEventController.duplicate
);

// Delete event (Super Admin)
adminEventRouter.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(eventIdParamSchema, 'params'),
  adminEventController.delete
);

// Get event attendees (Super Admin & Moderator)
adminEventRouter.get(
  '/:id/attendees',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(eventIdParamSchema, 'params'),
  validate(eventAttendeesQuerySchema, 'query'),
  adminEventController.getAttendees
);
