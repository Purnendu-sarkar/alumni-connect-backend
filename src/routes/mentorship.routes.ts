import { Router } from 'express';

import { mentorshipController } from '../controllers/mentorship.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import {
  clarifyReplySchema,
  clarifyRequestSchema,
  createMentorshipSchema,
  endMentorshipSchema,
  mentorshipIdParamSchema,
  mentorshipQuerySchema,
  rejectMentorshipSchema,
  updateAlumniNoteSchema,
  updateMentorshipAvailabilitySchema,
} from '../validators/mentorship.schema.js';

export const mentorshipRouter = Router();

mentorshipRouter.use(authenticate);

// Student only: submit mentorship proposal
mentorshipRouter.post(
  '/requests',
  requireRole('STUDENT'),
  validate(createMentorshipSchema),
  mentorshipController.create,
);

// Student and Alumni: list their mentorships
mentorshipRouter.get(
  '/',
  requireRole('STUDENT', 'ALUMNI'),
  validate(mentorshipQuerySchema, 'query'),
  mentorshipController.listMine,
);

// Mentorship session detail (Student / Alumni / Staff)
mentorshipRouter.get(
  '/:id',
  validate(mentorshipIdParamSchema, 'params'),
  mentorshipController.getById,
);

// Alumni only: request clarification from student
mentorshipRouter.patch(
  '/requests/:id/clarify',
  requireRole('ALUMNI'),
  validate(mentorshipIdParamSchema, 'params'),
  validate(clarifyRequestSchema),
  mentorshipController.clarify,
);

// Student only: reply to clarification inquiry
mentorshipRouter.patch(
  '/requests/:id/clarify-reply',
  requireRole('STUDENT'),
  validate(mentorshipIdParamSchema, 'params'),
  validate(clarifyReplySchema),
  mentorshipController.replyClarify,
);

// Alumni only: accept proposal
mentorshipRouter.patch(
  '/requests/:id/accept',
  requireRole('ALUMNI'),
  validate(mentorshipIdParamSchema, 'params'),
  mentorshipController.accept,
);

// Alumni only: decline proposal
mentorshipRouter.patch(
  '/requests/:id/reject',
  requireRole('ALUMNI'),
  validate(mentorshipIdParamSchema, 'params'),
  validate(rejectMentorshipSchema),
  mentorshipController.reject,
);

// Either participant: cancel proposal
mentorshipRouter.patch(
  '/:id/cancel',
  validate(mentorshipIdParamSchema, 'params'),
  validate(endMentorshipSchema),
  mentorshipController.cancel,
);

// Either participant: conclude active mentorship
mentorshipRouter.patch(
  '/:id/end',
  validate(mentorshipIdParamSchema, 'params'),
  validate(endMentorshipSchema),
  mentorshipController.end,
);

// Alumni only: update private session notes
mentorshipRouter.patch(
  '/:id/note',
  requireRole('ALUMNI'),
  validate(mentorshipIdParamSchema, 'params'),
  validate(updateAlumniNoteSchema),
  mentorshipController.updateNote,
);

// Alumni only: update mentorship availability & capacity settings
mentorshipRouter.patch(
  '/availability',
  requireRole('ALUMNI'),
  validate(updateMentorshipAvailabilitySchema),
  mentorshipController.updateAvailability,
);

// Super Admin platform-wide mentorship stats
export const adminMentorshipRouter = Router();
adminMentorshipRouter.use(authenticate);
adminMentorshipRouter.use(requireRole('SUPER_ADMIN'));
adminMentorshipRouter.get('/stats', mentorshipController.adminStats);
