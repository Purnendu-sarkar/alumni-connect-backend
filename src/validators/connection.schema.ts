import { z } from 'zod';

export const createConnectionSchema = z.object({
  recipientId: z.string().min(1, 'Recipient ID is required.'),
  message: z.string().trim().max(1000).optional(),
});

export const connectionIdParamSchema = z.object({
  id: z.string().min(1, 'Connection ID is required.'),
});

export const respondConnectionSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'DECLINED']),
});

export const connectionQuerySchema = z.object({
  tab: z.enum(['connected', 'received', 'sent', 'blocked']).default('connected'),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
