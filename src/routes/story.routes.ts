import { Router } from 'express';
import { storyController } from '../controllers/story.controller.js';
import { authenticate, optionalAuthenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  createStorySchema,
  storyIdParamSchema,
  storyQuerySchema,
  updateStorySchema,
} from '../validators/story.schema.js';

export const storyRouter = Router();

// Public / Reader: List published stories
storyRouter.get(
  '/',
  optionalAuthenticate,
  validate(storyQuerySchema, 'query'),
  storyController.listPublished
);

// Alumni Author: List own stories
storyRouter.get(
  '/mine',
  authenticate,
  requireRole('ALUMNI'),
  storyController.listMine
);

// Alumni Author: Get single own story with full owner DTO
storyRouter.get(
  '/mine/:id',
  authenticate,
  requireRole('ALUMNI'),
  validate(storyIdParamSchema, 'params'),
  storyController.getMineDetail
);

// Alumni Author: Create story draft
storyRouter.post(
  '/',
  authenticate,
  requireRole('ALUMNI'),
  validate(createStorySchema),
  storyController.create
);

// Alumni Author: Update story
storyRouter.patch(
  '/:id',
  authenticate,
  requireRole('ALUMNI'),
  validate(storyIdParamSchema, 'params'),
  validate(updateStorySchema),
  storyController.update
);

// Alumni Author: Submit story for review
storyRouter.post(
  '/:id/submit',
  authenticate,
  requireRole('ALUMNI'),
  validate(storyIdParamSchema, 'params'),
  storyController.submit
);

// Alumni Author: Withdraw story
storyRouter.post(
  '/:id/withdraw',
  authenticate,
  requireRole('ALUMNI'),
  validate(storyIdParamSchema, 'params'),
  storyController.withdraw
);

// Alumni Author / Admin: Unpublish story
storyRouter.post(
  '/:id/unpublish',
  authenticate,
  requireRole('ALUMNI', 'SUPER_ADMIN'),
  validate(storyIdParamSchema, 'params'),
  storyController.unpublish
);

// Alumni Author: Soft-delete draft
storyRouter.delete(
  '/:id',
  authenticate,
  requireRole('ALUMNI'),
  validate(storyIdParamSchema, 'params'),
  storyController.delete
);

// Reader / Public: Get story detail by ID or Slug
storyRouter.get(
  '/:id',
  optionalAuthenticate,
  validate(storyIdParamSchema, 'params'),
  storyController.getDetail
);
