import { z } from 'zod';

import { paginationQuerySchema } from '../utils/pagination.js';

export const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'INTERNSHIP',
  'CONTRACT',
]);

export const WorkModeEnum = z.enum(['ON_SITE', 'REMOTE', 'HYBRID']);

export const ExperienceLevelEnum = z.enum([
  'ANY',
  'ENTRY_LEVEL',
  'MID_LEVEL',
  'SENIOR',
  'EXECUTIVE',
]);

export const JobStatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'CLOSED',
  'PENDING',
]);

export const ApplicationStatusEnum = z.enum([
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'REJECTED',
  'ACCEPTED',
  'WITHDRAWN',
]);

export const JobModerationActionEnum = z.enum([
  'SUBMIT',
  'WITHDRAW',
  'CLAIM',
  'UNCLAIM',
  'APPROVE',
  'REJECT',
  'REQUEST_CHANGES',
  'OVERRIDE',
  'CLOSE',
]);

export const jobIdParamSchema = z.object({
  id: z.string().min(1, 'Job ID is required'),
});

export const applicationParamsSchema = z.object({
  id: z.string().min(1, 'Application ID is required'),
  jobId: z.string().optional(),
});

export const jobAndAppParamsSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required'),
  id: z.string().min(1, 'Application ID is required'),
});

export const jobQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  employmentType: z.string().trim().optional(),
  workMode: z.string().trim().optional(),
  experienceLevel: z.string().trim().optional(),
  location: z.string().trim().optional(),
  referralAvailable: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
  postedWithinDays: z.coerce.number().int().positive().optional(),
  sort: z.enum(['newest', 'closing_soon']).default('newest'),
});

export const createJobSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(160),
  company: z.string().trim().min(2, 'Company name is required').max(160),
  category: z.string().trim().min(2, 'Category is required').max(80).default('General'),
  description: z.string().trim().min(20, 'Description must be at least 20 characters').max(20000),
  requirements: z.string().trim().max(10000).optional().nullable(),
  employmentType: z.string().trim().default('FULL_TIME'),
  workMode: WorkModeEnum.default('ON_SITE'),
  experienceLevel: ExperienceLevelEnum.default('ANY'),
  location: z.string().trim().max(160).optional().nullable(),
  salaryMin: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().int().nonnegative().optional().nullable(),
  salaryCurrency: z.string().trim().max(5).default('BDT'),
  deadline: z.coerce.date().refine((d) => d > new Date(), {
    message: 'Deadline must be in the future',
  }),
  referralAvailable: z.boolean().default(false),
  requireResume: z.boolean().default(false),
  requireCoverLetter: z.boolean().default(false),
  applicationUrl: z.string().url().optional().nullable().or(z.literal('')),
  applicationEmail: z.string().email().optional().nullable().or(z.literal('')),
  submitNow: z.boolean().default(false),
});

export const updateJobSchema = createJobSchema.partial().extend({
  submitNow: z.boolean().optional(),
});

export const applyJobSchema = z.object({
  coverLetter: z.string().trim().max(2000).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(), // backward-compatible
  resumeKey: z.string().trim().max(255).optional().nullable(),
  shareProfileConsent: z.boolean().default(true),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'SHORTLISTED', 'REJECTED', 'ACCEPTED']),
  ownerNote: z.string().trim().max(1000).optional().nullable(),
});

export const withdrawApplicationSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
});

export const closeJobSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const moderatorClaimSchema = z.object({});

export const moderatorRejectSchema = z.object({
  reason: z.string().trim().min(10, 'Rejection reason must be at least 10 characters').max(1000),
  reasonCode: z.string().trim().max(50).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export const moderatorRequestChangesSchema = z.object({
  notes: z.string().trim().min(10, 'Change request instructions must be at least 10 characters').max(1000),
  internalNote: z.string().trim().max(1000).optional(),
});

export const moderatorReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  rejectionReason: z.string().trim().min(5).max(1000).optional(),
  reasonCode: z.string().trim().max(50).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export const reviewJobSchema = moderatorReviewSchema;

export const moderationQueueQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'DECIDED', 'ALL']).default('SUBMITTED'),
  mine: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
  category: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export const adminOverrideSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'UNPUBLISH', 'CLOSE']),
  reason: z.string().trim().min(5, 'Override reason must be at least 5 characters').max(1000),
  internalNote: z.string().trim().max(1000).optional(),
});

export const ownerApplicationsQuerySchema = paginationQuerySchema.extend({
  status: z.string().trim().optional(),
  q: z.string().trim().optional(),
});
