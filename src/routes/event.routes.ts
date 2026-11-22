import { Router } from 'express';

import { eventController } from '../controllers/event.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  eventIdParamSchema,
  eventQuerySchema,
  rsvpEventSchema,
} from '../validators/event.schema.js';

export const eventRouter = Router();

// Search & List published events (public or authenticated)
eventRouter.get(
  '/',
  optionalAuthenticate,
  validate(eventQuerySchema, 'query'),
  eventController.list
);

// Get current user's RSVP'd events
eventRouter.get(
  '/my-rsvps',
  authenticate,
  eventController.getMyRsvps
);

// Get single event detail
eventRouter.get(
  '/:id',
  authenticate,
  validate(eventIdParamSchema, 'params'),
  eventController.getById
);

// RSVP or update RSVP to an event
eventRouter.put(
  '/:id/rsvp',
  authenticate,
  validate(eventIdParamSchema, 'params'),
  validate(rsvpEventSchema),
  eventController.rsvp
);

// Cancel RSVP to an event
eventRouter.delete(
  '/:id/rsvp',
  authenticate,
  validate(eventIdParamSchema, 'params'),
  eventController.cancelRsvp
);
