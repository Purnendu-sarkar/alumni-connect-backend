import type { Prisma, EventStatus, EventMode } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export interface EventFilterParams {
  tab?: 'upcoming' | 'past' | 'my-rsvps' | 'all';
  category?: string;
  mode?: EventMode;
  q?: string;
  from?: Date;
  to?: Date;
  sort?: 'starts_at_asc' | 'starts_at_desc' | 'newest';
}

export interface AdminEventFilterParams {
  status?: 'ALL' | EventStatus;
  category?: string;
  mode?: EventMode;
  q?: string;
}

const eventIncludeCreator = {
  createdBy: {
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

export const eventRepository = {
  async findById(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...eventIncludeCreator,
        _count: {
          select: {
            rsvps: true,
          },
        },
      },
    });
  },

  async findWithViewerRsvp(id: string, viewerId?: string) {
    return prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...eventIncludeCreator,
        rsvps: viewerId
          ? {
              where: { userId: viewerId },
              select: {
                id: true,
                status: true,
                waitlistedAt: true,
                createdAt: true,
              },
            }
          : false,
      },
    });
  },

  async findManyPublished(
    filters: EventFilterParams,
    pagination: PaginationInput,
    universityId?: string
  ) {
    const now = new Date();
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      status: 'PUBLISHED',
      ...(universityId ? { universityId } : {}),
    };

    if (filters.tab === 'past') {
      where.startsAt = { lt: now };
    } else if (filters.tab === 'upcoming' || !filters.tab) {
      where.endsAt = { gte: now };
    }

    if (filters.category && filters.category !== 'All') {
      where.category = { equals: filters.category, mode: 'insensitive' };
    }

    if (filters.mode) {
      where.mode = filters.mode;
    }

    if (filters.from || filters.to) {
      where.startsAt = {
        ...(where.startsAt as object),
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { organizer: { contains: q, mode: 'insensitive' } },
        { venue: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy: Prisma.EventOrderByWithRelationInput = { startsAt: 'asc' };
    if (filters.tab === 'past' || filters.sort === 'starts_at_desc') {
      orderBy = { startsAt: 'desc' };
    } else if (filters.sort === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: eventIncludeCreator,
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
    ]);

    return { events, total };
  },

  async findManyAdmin(
    filters: AdminEventFilterParams,
    pagination: PaginationInput,
    universityId?: string
  ) {
    const where: Prisma.EventWhereInput = {
      deletedAt: null,
      ...(universityId ? { universityId } : {}),
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    if (filters.category && filters.category !== 'All') {
      where.category = { equals: filters.category, mode: 'insensitive' };
    }

    if (filters.mode) {
      where.mode = filters.mode;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { organizer: { contains: q, mode: 'insensitive' } },
        { venue: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          ...eventIncludeCreator,
          _count: {
            select: {
              rsvps: true,
            },
          },
        },
        orderBy: { startsAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.event.count({ where }),
    ]);

    return { events, total };
  },

  async create(data: Prisma.EventCreateInput, tx: Prisma.TransactionClient = prisma) {
    return tx.event.create({
      data,
      include: eventIncludeCreator,
    });
  },

  async update(id: string, data: Prisma.EventUpdateInput, tx: Prisma.TransactionClient = prisma) {
    return tx.event.update({
      where: { id },
      data,
      include: eventIncludeCreator,
    });
  },

  async softDelete(id: string, tx: Prisma.TransactionClient = prisma) {
    return tx.event.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async countRsvpsByStatus(eventId: string, tx: Prisma.TransactionClient = prisma) {
    const [going, maybe, notGoing, waitlisted] = await Promise.all([
      tx.eventRsvp.count({ where: { eventId, status: 'GOING' } }),
      tx.eventRsvp.count({ where: { eventId, status: 'MAYBE' } }),
      tx.eventRsvp.count({ where: { eventId, status: 'NOT_GOING' } }),
      tx.eventRsvp.count({ where: { eventId, status: 'WAITLISTED' } }),
    ]);

    return {
      going,
      maybe,
      notGoing,
      waitlisted,
      total: going + maybe + notGoing + waitlisted,
    };
  },
};
