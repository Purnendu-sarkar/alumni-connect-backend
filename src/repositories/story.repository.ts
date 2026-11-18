import type { Prisma, StoryCategory, StoryStatus } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export interface StoryFilterParams {
  q?: string;
  category?: StoryCategory | 'ALL';
  department?: string;
  graduationYear?: number;
  sort?: 'newest' | 'oldest';
}

export interface AdminStoryFilterParams {
  q?: string;
  status?: StoryStatus | 'ALL';
  category?: StoryCategory | 'ALL';
  authorId?: string;
}

const authorSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  department: true,
  batch: true,
  currentCompany: true,
  position: true,
  graduationYear: true,
  isActive: true,
  verificationStatus: true,
  privacySetting: {
    select: {
      profileVisibility: true,
      emailVisibility: true,
      careerVisibility: true,
      educationVisibility: true,
    },
  },
} as const;

export const storyRepository = {
  async findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.successStory.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: {
          select: authorSelect,
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        moderationHistory: {
          include: {
            moderator: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  async findBySlug(slug: string, universityId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.successStory.findFirst({
      where: { slug, universityId, deletedAt: null },
      include: {
        author: {
          select: authorSelect,
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
        moderationHistory: {
          include: {
            moderator: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  async findManyPublished(
    universityId: string,
    filters: StoryFilterParams,
    pagination: PaginationInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    const authorFilter: Prisma.UserWhereInput = {
      isActive: true,
    };

    if (filters.department) {
      authorFilter.department = { equals: filters.department, mode: 'insensitive' };
    }

    if (filters.graduationYear) {
      authorFilter.graduationYear = String(filters.graduationYear);
    }

    const where: Prisma.SuccessStoryWhereInput = {
      universityId,
      status: 'PUBLISHED',
      deletedAt: null,
      author: authorFilter,
    };

    if (filters.category && filters.category !== 'ALL') {
      where.category = filters.category;
    }

    if (filters.q?.trim()) {
      const term = filters.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { tags: { has: term } },
        { author: { name: { contains: term, mode: 'insensitive' } } },
        { author: { currentCompany: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const orderBy: Prisma.SuccessStoryOrderByWithRelationInput =
      filters.sort === 'oldest' ? { publishedAt: 'asc' } : { publishedAt: 'desc' };

    const [stories, total] = await Promise.all([
      tx.successStory.findMany({
        where,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          author: {
            select: authorSelect,
          },
        },
      }),
      tx.successStory.count({ where }),
    ]);

    return { stories, total };
  },

  async findManyByAuthor(
    authorId: string,
    universityId: string,
    statusFilter?: StoryStatus | 'ALL',
    pagination?: PaginationInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    const where: Prisma.SuccessStoryWhereInput = {
      authorId,
      universityId,
      deletedAt: null,
    };

    if (statusFilter && statusFilter !== 'ALL') {
      where.status = statusFilter;
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const [stories, total] = await Promise.all([
      tx.successStory.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: {
            select: authorSelect,
          },
          moderationHistory: {
            take: 3,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      tx.successStory.count({ where }),
    ]);

    return { stories, total };
  },

  async findManyAdmin(
    universityId: string,
    filters: AdminStoryFilterParams,
    pagination: PaginationInput,
    tx: Prisma.TransactionClient = prisma
  ) {
    const where: Prisma.SuccessStoryWhereInput = {
      universityId,
      deletedAt: null,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.category && filters.category !== 'ALL') {
      where.category = filters.category;
    }

    if (filters.authorId) {
      where.authorId = filters.authorId;
    }

    if (filters.q?.trim()) {
      const term = filters.q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { summary: { contains: term, mode: 'insensitive' } },
        { author: { name: { contains: term, mode: 'insensitive' } } },
        { author: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [stories, total] = await Promise.all([
      tx.successStory.findMany({
        where,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        include: {
          author: {
            select: authorSelect,
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          moderationHistory: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      tx.successStory.count({ where }),
    ]);

    return { stories, total };
  },

  async create(data: Prisma.SuccessStoryCreateInput, tx: Prisma.TransactionClient = prisma) {
    return tx.successStory.create({
      data,
      include: {
        author: {
          select: authorSelect,
        },
      },
    });
  },

  async update(id: string, data: Prisma.SuccessStoryUpdateInput, tx: Prisma.TransactionClient = prisma) {
    return tx.successStory.update({
      where: { id },
      data,
      include: {
        author: {
          select: authorSelect,
        },
      },
    });
  },

  async softDelete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.successStory.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'UNPUBLISHED',
        version: { increment: 1 },
      },
    });
  },

  async atomicClaim(storyId: string, universityId: string, moderatorId: string) {
    return prisma.successStory.updateMany({
      where: {
        id: storyId,
        universityId,
        status: 'SUBMITTED',
        reviewerId: null,
      },
      data: {
        status: 'UNDER_REVIEW',
        reviewerId: moderatorId,
        claimedAt: new Date(),
        version: { increment: 1 },
      },
    });
  },

  async atomicUnclaim(storyId: string, universityId: string, moderatorId: string) {
    return prisma.successStory.updateMany({
      where: {
        id: storyId,
        universityId,
        status: 'UNDER_REVIEW',
        reviewerId: moderatorId,
      },
      data: {
        status: 'SUBMITTED',
        reviewerId: null,
        claimedAt: null,
        version: { increment: 1 },
      },
    });
  },
};
