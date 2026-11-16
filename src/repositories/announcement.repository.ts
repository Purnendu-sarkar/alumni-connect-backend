import type {
  Prisma,
  AnnouncementStatus,
  AnnouncementCategory,
  AnnouncementAudience,
} from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export interface AnnouncementFilterParams {
  category?: AnnouncementCategory;
  q?: string;
}

export interface AdminAnnouncementFilterParams {
  status?: 'ALL' | AnnouncementStatus;
  category?: AnnouncementCategory;
  audience?: AnnouncementAudience;
  q?: string;
}

const announcementIncludeAuthor = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: {
        select: {
          name: true,
        },
      },
    },
  },
} as const;

export const announcementRepository = {
  async findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.announcement.findFirst({
      where: { id, deletedAt: null },
      include: announcementIncludeAuthor,
    });
  },

  async findManyPublished(
    userRole: string | undefined,
    filters: AnnouncementFilterParams,
    pagination: PaginationInput,
    universityId?: string
  ) {
    const now = new Date();
    const where: Prisma.AnnouncementWhereInput = {
      deletedAt: null,
      status: 'PUBLISHED',
      ...(universityId ? { universityId } : {}),
      AND: [
        {
          OR: [
            { publishAt: null },
            { publishAt: { lte: now } },
          ],
        },
        {
          OR: [
            { archiveAt: null },
            { archiveAt: { gt: now } },
          ],
        },
      ],
    };

    if (userRole === 'STUDENT') {
      where.audience = { in: ['ALL', 'STUDENTS'] };
    } else if (userRole === 'ALUMNI') {
      where.audience = { in: ['ALL', 'ALUMNI'] };
    } else if (userRole === 'MODERATOR' || userRole === 'SUPER_ADMIN') {
      // Moderators and super admins can view any published announcement
    } else {
      // Public / unauthenticated
      where.audience = 'ALL';
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: announcementIncludeAuthor,
        orderBy: [
          { pinned: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    return { announcements, total };
  },

  async findManyAdmin(
    filters: AdminAnnouncementFilterParams,
    pagination: PaginationInput,
    universityId?: string
  ) {
    const where: Prisma.AnnouncementWhereInput = {
      deletedAt: null,
      ...(universityId ? { universityId } : {}),
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.audience) {
      where.audience = filters.audience;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: announcementIncludeAuthor,
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.announcement.count({ where }),
    ]);

    return { announcements, total };
  },

  async countActivePinned(excludeId?: string, universityId?: string, tx: Prisma.TransactionClient = prisma) {
    return tx.announcement.count({
      where: {
        pinned: true,
        status: 'PUBLISHED',
        deletedAt: null,
        ...(universityId ? { universityId } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async create(data: Prisma.AnnouncementCreateInput, tx: Prisma.TransactionClient = prisma) {
    return tx.announcement.create({
      data,
      include: announcementIncludeAuthor,
    });
  },

  async update(
    id: string,
    data: Prisma.AnnouncementUpdateInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.announcement.update({
      where: { id },
      data,
      include: announcementIncludeAuthor,
    });
  },

  async softDelete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.announcement.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async hardDelete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.announcement.delete({
      where: { id },
    });
  },
};
