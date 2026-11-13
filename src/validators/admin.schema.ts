import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
});

export const reviewVerificationSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'REVOKED']),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, context) => {
    if (
      (data.status === 'REJECTED' || data.status === 'REVOKED') &&
      (!data.reason || data.reason.trim().length < 3)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `A reason of at least 3 characters is required to ${data.status.toLowerCase()} accreditation.`,
      });
    }
  });

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['STUDENT', 'ALUMNI', 'MODERATOR', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  search: z.string().trim().optional(),
});

export const verificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['STUDENT', 'ALUMNI']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().default('PENDING'),
  search: z.string().trim().optional(),
});

export const inviteModeratorSchema = z.object({
  email: z.string().email('Please enter a valid email address.').trim().toLowerCase(),
});

export const invitationIdParamSchema = z.object({
  id: z.string().min(1, 'Invitation ID is required.'),
});

export const toggleSuspensionSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
