import { z } from 'zod';

export const userIdParamSchema = z.object({ userId: z.string().cuid() });
