import { z } from 'zod';
import { EmploymentType, WorkMode } from '@prisma/client';

export const createJobSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(150),
    company: z.string().trim().min(2, 'Company name is required.').max(120),
    description: z.string().trim().min(20, 'Description must be at least 20 characters.').max(10_000),
    requirements: z.string().trim().max(10_000).optional(),
    location: z.string().trim().max(120).optional(),
    employmentType: z.nativeEnum(EmploymentType),
    workMode: z.nativeEnum(WorkMode).optional().default(WorkMode.ON_SITE),
    salaryMin: z.coerce.number().int().nonnegative().optional(),
    salaryMax: z.coerce.number().int().nonnegative().optional(),
    salaryCurrency: z.string().trim().default('BDT'),
    applicationUrl: z.string().url().optional().or(z.literal('')),
    applicationEmail: z.string().email().optional().or(z.literal('')),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((data) => data.applicationUrl || data.applicationEmail, {
    message: 'Provide an application URL or application email address.',
    path: ['applicationUrl'],
  });

export const jobIdParamSchema = z.object({
  id: z.string().min(1, 'Job ID is required.'),
});

export const moderateJobSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reasonCode: z.enum(['SPAM', 'INAPPROPRIATE', 'DUPLICATE', 'INSUFFICIENT_INFO', 'POLICY_VIOLATION', 'OTHER']).optional(),
  note: z.string().trim().max(500).optional(),
});

export const applyJobSchema = z.object({
  coverNote: z.string().trim().max(2000).optional(),
  resumeUrl: z.string().url().optional(),
});
