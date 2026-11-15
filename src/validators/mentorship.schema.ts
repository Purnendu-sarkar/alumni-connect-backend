import { z } from 'zod';

export const createMentorshipSchema = z.object({
  mentorId: z.string().min(1, 'Mentor ID is required.'),
  topic: z.string().trim().min(3, 'Topic must be at least 3 characters.').max(150),
  careerGoal: z.string().trim().min(5, 'Career goal must be at least 5 characters.').max(500),
  message: z.string().trim().min(10, 'Message must be at least 10 characters.').max(2000),
  preferredCommunication: z.string().trim().min(1).max(50).default('CHAT'),
  availability: z.string().trim().min(1, 'Availability details are required.').max(100),
  expectedDuration: z.string().trim().max(100).optional(),
});

export const clarifyRequestSchema = z.object({
  question: z.string().trim().min(5, 'Clarification question must be at least 5 characters.').max(1000),
});

export const clarifyReplySchema = z.object({
  reply: z.string().trim().min(5, 'Clarification reply must be at least 5 characters.').max(1000),
});

export const rejectMentorshipSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const endMentorshipSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const updateAlumniNoteSchema = z.object({
  note: z.string().trim().max(5000),
  scheduledAt: z.coerce.date().nullable().optional(),
});

export const updateMentorshipAvailabilitySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']),
  maxActiveMentees: z.number().int().min(1).max(20).optional(),
  topics: z.array(z.string().trim()).max(20).optional(),
});

export const mentorshipQuerySchema = z.object({
  group: z.enum(['requests', 'active', 'history']).optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const mentorshipIdParamSchema = z.object({
  id: z.string().min(1, 'Mentorship ID is required.'),
});
