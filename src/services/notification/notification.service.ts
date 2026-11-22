import type { NotificationType, Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../config/logger.js';
import { notificationRepository } from '../../repositories/notification.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { toPageMeta } from '../../utils/pagination.js';

const MANDATORY_TYPES = new Set<NotificationType>([
  'SECURITY_ALERT',
  'ACCOUNT_VERIFICATION',
  'RESTRICTION_APPLIED',
  'RESTRICTION_ENDED',
]);

export interface SendNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface SendRoleNotificationInput {
  universityId?: string;
  roles: Array<'SUPER_ADMIN' | 'MODERATOR' | 'ALUMNI' | 'STUDENT'>;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Prisma.InputJsonValue;
}

function sanitizeLink(link?: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return null;
}

export const notificationService = {
  async notifyUser(input: SendNotificationInput) {
    try {
      const sanitizedLink = sanitizeLink(input.link);

      if (!MANDATORY_TYPES.has(input.type)) {
        const preferences = await notificationRepository.getPreferences(input.userId);
        const preference = preferences.find((p) => p.type === input.type);
        if (preference && !preference.inApp) {
          return null;
        }
      }

      const created = await notificationRepository.create({
        ...input,
        link: sanitizedLink,
      });
      await cacheService.del(`user:${input.userId}:notif_unread`);
      return created;
    } catch (error) {
      logger.warn({ error, userId: input.userId, type: input.type }, 'Failed to deliver notification to user.');
      return null;
    }
  },

  async notifyRoles(input: SendRoleNotificationInput) {
    try {
      const users = await userRepository.findActiveUsersByRoles(input.roles, input.universityId);
      if (users.length === 0) return [];

      const sanitizedLink = sanitizeLink(input.link);
      const notifications = users.map((u) => ({
        userId: u.id,
        type: input.type,
        title: input.title,
        body: input.body,
        link: sanitizedLink,
        metadata: input.metadata,
      }));

      await notificationRepository.createMany(notifications);
      await Promise.all(users.map((u) => cacheService.del(`user:${u.id}:notif_unread`)));
      return notifications;
    } catch (error) {
      logger.warn({ error, roles: input.roles, type: input.type }, 'Failed to broadcast notification to roles.');
      return [];
    }
  },

  async getUserNotifications(
    userId: string,
    query: {
      filter?: 'all' | 'unread';
      type?: NotificationType;
      page?: number;
      limit?: number;
    },
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;

    const { notifications, total, unreadCount } = await notificationRepository.findPaginatedByUser(
      userId,
      {
        filter: query.filter,
        type: query.type,
        page,
        limit,
      },
    );

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        metadata: n.metadata,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        isRead: Boolean(n.readAt),
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      meta: toPageMeta(page, limit, total),
    };
  },

  async getUnreadCount(userId: string) {
    const cacheKey = `user:${userId}:notif_unread`;
    const cached = await cacheService.get<{ unreadCount: number }>(cacheKey);
    if (cached) {
      return cached;
    }
    const unreadCount = await notificationRepository.countUnreadByUser(userId);
    const result = { unreadCount };
    await cacheService.set(cacheKey, result, 60);
    return result;
  },

  async markAsRead(id: string, userId: string) {
    await notificationRepository.markAsRead(id, userId);
    await cacheService.del(`user:${userId}:notif_unread`);
    return { success: true };
  },

  async markAllAsRead(userId: string) {
    await notificationRepository.markAllAsRead(userId);
    await cacheService.del(`user:${userId}:notif_unread`);
    return { success: true };
  },

  async deleteNotification(id: string, userId: string) {
    await notificationRepository.deleteById(id, userId);
    await cacheService.del(`user:${userId}:notif_unread`);
    return { success: true };
  },

  async getPreferences(userId: string) {
    return notificationRepository.getPreferences(userId);
  },

  async updatePreferences(
    userId: string,
    preferences: Array<{ type: NotificationType; inApp?: boolean; email?: boolean }>,
  ) {
    const results = await Promise.all(
      preferences.map((pref) =>
        notificationRepository.upsertPreference(userId, pref.type, {
          inApp: pref.inApp,
          email: pref.email,
        }),
      ),
    );
    return results;
  },
};
