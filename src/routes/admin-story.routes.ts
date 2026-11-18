import { Router } from 'express';
import { adminStoryController } from '../controllers/admin-story.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  adminOverrideSchema,
  adminStoryQuerySchema,
  moderationDecisionSchema,
  requestChangesSchema,
  storyIdParamSchema,
} from '../validators/story.schema.js';

export const adminStoryRouter = Router();

// List stories for editorial queue (Moderator & Super Admin)
adminStoryRouter.get(
  '/',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(adminStoryQuerySchema, 'query'),
  adminStoryController.list
);

// Get story editorial detail (Moderator & Super Admin)
adminStoryRouter.get(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.getById
);

// Claim story for review
adminStoryRouter.post(
  '/:id/claim',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.claim
);

// Unclaim story (release back to queue)
adminStoryRouter.post(
  '/:id/unclaim',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.unclaim
);

// Approve & publish story
adminStoryRouter.post(
  '/:id/approve',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.approve
);

// Reject story with mandatory reason
adminStoryRouter.post(
  '/:id/reject',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  validate(moderationDecisionSchema),
  adminStoryController.reject
);

// Request revisions from author with mandatory notes
adminStoryRouter.post(
  '/:id/request-changes',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  validate(requestChangesSchema),
  adminStoryController.requestChanges
);

// Moderator: Unpublish story
adminStoryRouter.post(
  '/:id/unpublish',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.unpublish
);

// Moderator: Restore story
adminStoryRouter.post(
  '/:id/restore',
  authenticate,
  requireRole('SUPER_ADMIN', 'MODERATOR'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.restore
);

// Super Admin: Administrative override status
adminStoryRouter.post(
  '/:id/override',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(storyIdParamSchema, 'params'),
  validate(adminOverrideSchema),
  adminStoryController.override
);

// Super Admin: Permanently delete story
adminStoryRouter.delete(
  '/:id',
  authenticate,
  requireRole('SUPER_ADMIN'),
  validate(storyIdParamSchema, 'params'),
  adminStoryController.delete
);
