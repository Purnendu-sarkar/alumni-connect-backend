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
      (!data.reason || data.reason.trim().length < 10)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: `A reason of at least 10 characters is required to ${data.status.toLowerCase()} accreditation.`,
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
  department: z.string().trim().optional(),
});

export const verificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  role: z.enum(['STUDENT', 'ALUMNI']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().default('PENDING'),
  emailVerified: z.enum(['ALL', 'VERIFIED', 'UNVERIFIED']).optional().default('ALL'),
  search: z.string().trim().optional(),
});

export const inviteModeratorSchema = z.object({
  email: z.string().email('Please enter a valid email address.').trim().toLowerCase(),
});

export const invitationIdParamSchema = z.object({
  id: z.string().min(1, 'Invitation ID is required.'),
});

export const toggleSuspensionSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, context) => {
    if (!data.isActive && (!data.reason || data.reason.trim().length < 10)) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A reason of at least 10 characters is required to suspend a user account.',
      });
    }
  });

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120).optional(),
  departmentId: z.string().trim().nullable().optional(),
  department: z.string().trim().max(120).nullable().optional(),
  batch: z.string().trim().max(40).nullable().optional(),
  graduationYear: z.string().trim().max(20).nullable().optional(),
  studentId: z.string().trim().max(60).nullable().optional(),
  academicId: z.string().trim().max(60).nullable().optional(),
  currentSemester: z.string().trim().max(40).nullable().optional(),
  expectedGraduationYear: z.string().trim().max(20).nullable().optional(),
  position: z.string().trim().max(120).nullable().optional(),
  currentPosition: z.string().trim().max(120).nullable().optional(),
  currentCompany: z.string().trim().max(120).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  employmentStatus: z.string().trim().max(60).nullable().optional(),
});

export const changeUserRoleSchema = z.object({
  role: z.enum(['STUDENT', 'ALUMNI']),
  graduationYear: z.string().trim().max(20).nullable().optional(),
  batch: z.string().trim().max(40).nullable().optional(),
  reason: z
    .string()
    .trim()
    .min(10, 'A reason of at least 10 characters is required to change a user role.')
    .max(500),
});

export const removeModeratorSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'A reason of at least 10 characters is required to remove a moderator.')
    .max(500),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().optional(),
  action: z.string().trim().optional(),
  actorId: z.string().trim().optional(),
  actorRole: z.string().trim().optional(),
  targetType: z.string().trim().optional(),
  result: z.enum(['SUCCESS', 'FAILURE']).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});
