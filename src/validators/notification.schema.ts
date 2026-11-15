import { z } from 'zod';
import { NotificationType } from '../generated/prisma/client.js';

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  filter: z.enum(['all', 'unread']).default('all'),
  type: z.nativeEnum(NotificationType).optional(),
});

export const notificationIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Notification ID is required.'),
});

export const updateNotificationPreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.nativeEnum(NotificationType),
        inApp: z.boolean().optional(),
        email: z.boolean().optional(),
      }),
    )
    .min(1, 'At least one notification preference update is required.'),
});
