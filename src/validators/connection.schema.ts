import { z } from 'zod';

export const createConnectionSchema = z.object({
  receiverId: z.string().min(1, 'Target member ID is required.'),
  note: z.string().trim().max(200, 'Connection note cannot exceed 200 characters.').optional(),
});

export const connectionIdParamSchema = z.object({
  id: z.string().min(1, 'Connection ID is required.'),
});

export const respondConnectionSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
});
