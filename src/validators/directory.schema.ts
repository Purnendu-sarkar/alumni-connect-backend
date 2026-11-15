import { z } from 'zod';

export const directoryQuerySchema = z.object({
  group: z.enum(['alumni', 'students']).optional(),
  q: z.string().trim().optional(),
  department: z.string().trim().optional(),
  gradYear: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  location: z.string().trim().optional(),
  skills: z
    .union([z.string().transform((val) => [val]), z.array(z.string())])
    .optional(),
  mentorship: z.union([z.boolean(), z.string()]).optional(),
  sort: z.enum(['name', 'graduationYear', 'recentlyJoined']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const directoryMemberParamSchema = z.object({
  id: z.string().min(1, 'Member ID is required.'),
});
