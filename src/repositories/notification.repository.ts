import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface NotificationFilterOptions {
  filter?: 'all' | 'unread';
  type?: NotificationType;
  page?: number;
  limit?: number;
}

export const notificationRepository = {
  async create(input: CreateNotificationInput) {
    const userExists = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!userExists) return null;

    return prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  },

  createMany(items: CreateNotificationInput[]) {
    if (items.length === 0) return Promise.resolve({ count: 0 });
    return prisma.notification.createMany({
      data: items.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        metadata: input.metadata ?? undefined,
      })),
    });
  },

  findById(id: string, userId?: string) {
    return prisma.notification.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
      },
    });
  },

  async findPaginatedByUser(userId: string, options: NotificationFilterOptions) {
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? options.limit : 20;

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(options.filter === 'unread' ? { readAt: null } : {}),
      ...(options.type ? { type: options.type } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId,
          readAt: null,
        },
      }),
    ]);

    return { notifications, total, unreadCount };
  },

  countUnreadByUser(userId: string) {
    return prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  },

  markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: {
        id,
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  },

  markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  },

  deleteById(id: string, userId: string) {
    return prisma.notification.deleteMany({
      where: {
        id,
        userId,
      },
    });
  },

  getPreferences(userId: string) {
    return prisma.notificationPreference.findMany({
      where: { userId },
    });
  },

  upsertPreference(
    userId: string,
    type: NotificationType,
    preferences: { inApp?: boolean; email?: boolean },
  ) {
    return prisma.notificationPreference.upsert({
      where: {
        userId_type: {
          userId,
          type,
        },
      },
      update: {
        ...(preferences.inApp !== undefined ? { inApp: preferences.inApp } : {}),
        ...(preferences.email !== undefined ? { email: preferences.email } : {}),
      },
      create: {
        userId,
        type,
        inApp: preferences.inApp ?? true,
        email: preferences.email ?? true,
      },
    });
  },
};
