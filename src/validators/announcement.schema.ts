import { z } from 'zod';

import { paginationQuerySchema } from '../utils/pagination.js';

export const AnnouncementStatusEnum = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const AnnouncementCategoryEnum = z.enum(['GENERAL', 'ACADEMIC', 'CAREER', 'EVENT', 'SECURITY_SYSTEM']);
export const AnnouncementAudienceEnum = z.enum(['ALL', 'STUDENTS', 'ALUMNI']);

export const announcementIdParamSchema = z.object({
  id: z.string().min(1, 'Announcement ID is required'),
});

export const announcementQuerySchema = paginationQuerySchema.extend({
  category: AnnouncementCategoryEnum.optional(),
  q: z.string().trim().optional(),
});

export const adminAnnouncementQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED']).default('ALL'),
  category: AnnouncementCategoryEnum.optional(),
  audience: AnnouncementAudienceEnum.optional(),
  q: z.string().trim().optional(),
});

export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120),
    body: z.string().trim().min(20, 'Body must be at least 20 characters').max(10000),
    category: AnnouncementCategoryEnum.default('GENERAL'),
    audience: AnnouncementAudienceEnum.default('ALL'),
    pinned: z.boolean().default(false),
    publishAt: z.coerce.date().optional().nullable(),
    archiveAt: z.coerce.date().optional().nullable(),
    status: AnnouncementStatusEnum.default('DRAFT'),
    notify: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.publishAt && data.archiveAt) {
        return data.archiveAt > data.publishAt;
      }
      return true;
    },
    {
      message: 'Archive date must be after publish date',
      path: ['archiveAt'],
    }
  );

export const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120).optional(),
    body: z.string().trim().min(20, 'Body must be at least 20 characters').max(10000).optional(),
    category: AnnouncementCategoryEnum.optional(),
    audience: AnnouncementAudienceEnum.optional(),
    pinned: z.boolean().optional(),
    publishAt: z.coerce.date().optional().nullable(),
    archiveAt: z.coerce.date().optional().nullable(),
    status: AnnouncementStatusEnum.optional(),
    notify: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.publishAt && data.archiveAt) {
        return data.archiveAt > data.publishAt;
      }
      return true;
    },
    {
      message: 'Archive date must be after publish date',
      path: ['archiveAt'],
    }
  );

export const togglePinSchema = z.object({
  pinned: z.boolean(),
});
