import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
});

export const reviewVerificationSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, context) => {
    if (data.status === 'REJECTED' && (!data.reason || data.reason.trim().length < 3)) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A rejection reason of at least 3 characters is required.',
      });
    }
  });

export const verificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['STUDENT', 'ALUMNI']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().default('PENDING'),
  search: z.string().trim().optional(),
});
