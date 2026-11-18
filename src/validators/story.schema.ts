import { z } from 'zod';
import { StoryCategory, StoryStatus } from '../generated/prisma/client.js';

export const storyCategoryEnum = z.nativeEnum(StoryCategory);
export const storyStatusEnum = z.nativeEnum(StoryStatus);

export const createStorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(120, 'Title cannot exceed 120 characters'),
  summary: z
    .string()
    .trim()
    .min(10, 'Summary must be at least 10 characters')
    .max(300, 'Summary cannot exceed 300 characters'),
  body: z
    .string()
    .trim()
    .min(20, 'Story body must be at least 20 characters'),
  category: storyCategoryEnum.default(StoryCategory.CAREER_MILESTONE),
  tags: z.array(z.string().trim().max(30)).max(10).optional().default([]),
  coverImageUrl: z.string().url().nullable().optional(),
  coverImagePublicId: z.string().nullable().optional(),
  embeddedMediaPublicIds: z.array(z.string()).optional().default([]),
  submitNow: z.boolean().optional().default(false),
});

export const updateStorySchema = createStorySchema.partial().extend({
  submitNow: z.boolean().optional(),
});

export const storyQuerySchema = z.object({
  q: z.string().optional(),
  category: z.union([storyCategoryEnum, z.literal('ALL')]).optional(),
  department: z.string().optional(),
  graduationYear: z.coerce.number().int().optional(),
  sort: z.enum(['newest', 'oldest']).optional().default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
});

export const adminStoryQuerySchema = z.object({
  q: z.string().optional(),
  status: z.union([storyStatusEnum, z.literal('ALL'), z.literal('PENDING_QUEUE')]).optional(),
  category: z.union([storyCategoryEnum, z.literal('ALL')]).optional(),
  authorId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const storyIdParamSchema = z.object({
  id: z.string().min(1, 'Story ID is required'),
});

export const moderationDecisionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'A reason of at least 10 characters is required for review decisions')
    .max(1000, 'Reason cannot exceed 1000 characters'),
  internalNote: z.string().trim().max(1000).optional(),
});

export const requestChangesSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(10, 'Revision feedback must be at least 10 characters')
    .max(1000, 'Notes cannot exceed 1000 characters'),
  internalNote: z.string().trim().max(1000).optional(),
});

export const adminOverrideSchema = z.object({
  status: storyStatusEnum,
  reason: z.string().trim().min(5, 'Reason for administrative override is required'),
});
