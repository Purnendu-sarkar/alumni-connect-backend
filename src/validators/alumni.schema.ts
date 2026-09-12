import { z } from 'zod';

import { paginationQuerySchema } from '../utils/pagination.js';

export const alumniQuerySchema = paginationQuerySchema.extend({
  batch: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(100).optional(),
  company: z.string().trim().min(1).max(100).optional(),
});
