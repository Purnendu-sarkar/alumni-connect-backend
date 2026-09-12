import { z } from 'zod';

export const createConnectionSchema = z.object({
  recipientId: z.string().cuid(),
  message: z.string().trim().min(1).max(1_000).optional(),
});

export const connectionIdParamSchema = z.object({ id: z.string().cuid() });

export const respondConnectionSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});
