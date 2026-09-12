import { z } from 'zod';

import { paginationQuerySchema } from '../utils/pagination.js';

export const jobQuerySchema = paginationQuerySchema;

export const createJobSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(20).max(20_000),
    company: z.string().trim().min(2).max(160),
    location: z.string().trim().min(2).max(160).optional(),
    employmentType: z.string().trim().min(2).max(50).optional(),
    applicationUrl: z.url().optional(),
    applicationEmail: z.email().optional(),
    expiresAt: z.coerce.date().min(new Date()).optional(),
  })
  .refine((data) => data.applicationUrl || data.applicationEmail, {
    message: 'Provide an application URL or application email.',
    path: ['applicationUrl'],
  });

export const jobIdParamSchema = z.object({ id: z.string().cuid() });

export const reviewJobSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().min(5).max(1_000).optional(),
  })
  .superRefine((data, context) => {
    if (data.status === 'REJECTED' && !data.rejectionReason) {
      context.addIssue({
        code: 'custom',
        path: ['rejectionReason'],
        message: 'A rejection reason is required when rejecting a job.',
      });
    }
  });

export const applyJobSchema = z.object({
  message: z.string().trim().min(1).max(2_000).optional(),
});
