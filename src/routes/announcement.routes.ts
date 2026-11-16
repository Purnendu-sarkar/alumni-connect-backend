import { Router } from 'express';

import { announcementController } from '../controllers/announcement.controller.js';
import { optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  announcementIdParamSchema,
  announcementQuerySchema,
} from '../validators/announcement.schema.js';

export const announcementRouter = Router();

// List published announcements (public or authenticated)
announcementRouter.get(
  '/',
  optionalAuthenticate,
  validate(announcementQuerySchema, 'query'),
  announcementController.list
);

// Get single announcement detail
announcementRouter.get(
  '/:id',
  optionalAuthenticate,
  validate(announcementIdParamSchema, 'params'),
  announcementController.getById
);
