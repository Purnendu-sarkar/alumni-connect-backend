import { z } from 'zod';

export const blockUserSchema = z.object({
  blockedId: z.string().min(1, 'Target user ID is required.'),
  reason: z.string().trim().max(500).optional(),
});

export const unblockParamSchema = z.object({
  userId: z.string().min(1, 'Target user ID is required.'),
});
