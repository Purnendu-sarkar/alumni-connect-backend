import { z } from 'zod';

import { paginationQuerySchema } from '../utils/pagination.js';

export const EventStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']);
export const EventModeEnum = z.enum(['IN_PERSON', 'ONLINE', 'HYBRID']);
export const RsvpStatusEnum = z.enum(['GOING', 'MAYBE', 'NOT_GOING', 'WAITLISTED', 'CANCELLED']);

export const eventIdParamSchema = z.object({
  id: z.string().min(1, 'Event ID is required'),
});

export const eventQuerySchema = paginationQuerySchema.extend({
  tab: z.enum(['upcoming', 'past', 'my-rsvps', 'all']).default('upcoming'),
  category: z.string().trim().optional(),
  mode: EventModeEnum.optional(),
  q: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['starts_at_asc', 'starts_at_desc', 'newest']).default('starts_at_asc'),
});

export const adminEventQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ALL', 'DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED']).default('ALL'),
  category: z.string().trim().optional(),
  mode: EventModeEnum.optional(),
  q: z.string().trim().optional(),
});

export const createEventSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120),
    description: z.string().trim().min(20, 'Description must be at least 20 characters').max(10000),
    category: z.string().trim().min(2, 'Category is required').max(60).default('GENERAL'),
    organizer: z.string().trim().max(100).optional().nullable(),
    mode: EventModeEnum.default('IN_PERSON'),
    venue: z.string().trim().max(150).optional().nullable(),
    onlineUrl: z.string().url('Must be a valid URL').max(500).optional().nullable().or(z.literal('')),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    rsvpDeadline: z.coerce.date().optional().nullable(),
    capacity: z.coerce.number().int().positive('Capacity must be at least 1').optional().nullable(),
    waitlistEnabled: z.boolean().default(true),
    bannerUrl: z.string().trim().max(500).optional().nullable(),
    bannerPublicId: z.string().trim().max(255).optional().nullable(),
    bannerKey: z.string().trim().max(255).optional().nullable(),
    reminderEnabled: z.boolean().default(true),
    status: EventStatusEnum.default('DRAFT'),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: 'Event end time must be after start time',
    path: ['endsAt'],
  })
  .refine(
    (data) => {
      if (data.rsvpDeadline && data.rsvpDeadline > data.startsAt) {
        return false;
      }
      return true;
    },
    {
      message: 'RSVP deadline must be before the event starts',
      path: ['rsvpDeadline'],
    }
  );

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120).optional(),
    description: z.string().trim().min(20, 'Description must be at least 20 characters').max(10000).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    organizer: z.string().trim().max(100).optional().nullable(),
    mode: EventModeEnum.optional(),
    venue: z.string().trim().max(150).optional().nullable(),
    onlineUrl: z.string().url('Must be a valid URL').max(500).optional().nullable().or(z.literal('')),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    rsvpDeadline: z.coerce.date().optional().nullable(),
    capacity: z.coerce.number().int().positive('Capacity must be at least 1').optional().nullable(),
    waitlistEnabled: z.boolean().optional(),
    bannerUrl: z.string().trim().max(500).optional().nullable(),
    bannerPublicId: z.string().trim().max(255).optional().nullable(),
    bannerKey: z.string().trim().max(255).optional().nullable(),
    reminderEnabled: z.boolean().optional(),
    status: EventStatusEnum.optional(),
  })
  .refine(
    (data) => {
      if (data.startsAt && data.endsAt) {
        return data.endsAt > data.startsAt;
      }
      return true;
    },
    {
      message: 'Event end time must be after start time',
      path: ['endsAt'],
    }
  );

export const rsvpEventSchema = z.object({
  status: z.enum(['GOING', 'MAYBE', 'NOT_GOING']),
});

export const cancelEventSchema = z.object({
  cancelReason: z.string().trim().min(5, 'Cancellation reason must be at least 5 characters').max(500),
});

export const eventAttendeesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ALL', 'GOING', 'MAYBE', 'NOT_GOING', 'WAITLISTED', 'CANCELLED']).default('ALL'),
  q: z.string().trim().optional(),
});
