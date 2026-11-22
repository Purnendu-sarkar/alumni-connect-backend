import { z } from 'zod';
import { ReportType, ReportStatus, RestrictionType } from '../generated/prisma/client.js';

export const createReportSchema = z.object({
  targetType: z.enum(['USER', 'JOB', 'STORY', 'MESSAGE', 'EVENT']),
  targetId: z.string().trim().min(1, 'Target ID is required.'),
  type: z.nativeEnum(ReportType).default(ReportType.OTHER),
  reason: z
    .string()
    .trim()
    .min(10, 'Reason must be at least 10 characters long.')
    .max(1000, 'Reason cannot exceed 1000 characters.'),
  details: z.string().trim().max(2000).optional(),
});

export const reportIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Report ID is required.'),
});

export const moderatorReportQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(ReportStatus).optional(),
  type: z.nativeEnum(ReportType).optional(),
  targetType: z.enum(['USER', 'JOB', 'STORY', 'MESSAGE', 'EVENT']).optional(),
  q: z.string().trim().optional(),
  escalated: z.enum(['true', 'false']).optional(),
});

export const moderatorResolveReportSchema = z.object({
  actionType: z.enum(['NONE', 'HIDE_CONTENT', 'WARN_USER', 'RESTRICT_USER', 'ESCALATE']),
  resolutionNote: z
    .string()
    .trim()
    .min(5, 'Resolution note must be at least 5 characters.')
    .max(1000, 'Resolution note cannot exceed 1000 characters.'),
  restrictionType: z.nativeEnum(RestrictionType).optional(),
  durationDays: z.coerce.number().int().min(1).max(7).optional(),
  publicMessageToTarget: z.string().trim().max(500).optional(),
});

export const moderatorRejectReportSchema = z.object({
  resolutionNote: z
    .string()
    .trim()
    .min(5, 'Rejection note must be at least 5 characters.')
    .max(1000, 'Rejection note cannot exceed 1000 characters.'),
});

export const adminOverturnReportSchema = z.object({
  overturnReason: z
    .string()
    .trim()
    .min(5, 'Overturn reason must be at least 5 characters.')
    .max(1000, 'Overturn reason cannot exceed 1000 characters.'),
});

export const adminReassignReportSchema = z.object({
  moderatorId: z.string().trim().min(1, 'Moderator ID is required.'),
});

export const adminLiftRestrictionSchema = z.object({
  revokeReason: z
    .string()
    .trim()
    .min(5, 'Revoke reason must be at least 5 characters.')
    .max(1000, 'Revoke reason cannot exceed 1000 characters.'),
});
