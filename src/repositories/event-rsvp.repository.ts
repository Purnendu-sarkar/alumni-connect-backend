import type { Prisma, RsvpStatus } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

const attendeeUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  department: true,
  batch: true,
  graduationYear: true,
  role: {
    select: {
      name: true,
    },
  },
} as const;

export const eventRsvpRepository = {
  async findByEventAndUser(
    eventId: string,
    userId: string,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.eventRsvp.findUnique({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
    });
  },

  async upsertRsvp(
    eventId: string,
    userId: string,
    status: RsvpStatus,
    waitlistedAt: Date | null = null,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.eventRsvp.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId,
        },
      },
      create: {
        eventId,
        userId,
        status,
        waitlistedAt,
      },
      update: {
        status,
        waitlistedAt,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: attendeeUserSelect,
        },
      },
    });
  },

  async countGoing(eventId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.eventRsvp.count({
      where: {
        eventId,
        status: 'GOING',
      },
    });
  },

  async countWaitlisted(eventId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.eventRsvp.count({
      where: {
        eventId,
        status: 'WAITLISTED',
      },
    });
  },

  async findEarliestWaitlisted(
    eventId: string,
    limit: number = 1,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.eventRsvp.findMany({
      where: {
        eventId,
        status: 'WAITLISTED',
      },
      orderBy: [
        { waitlistedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      take: limit,
      include: {
        user: {
          select: attendeeUserSelect,
        },
      },
    });
  },

  async updateRsvpStatus(
    id: string,
    status: RsvpStatus,
    waitlistedAt: Date | null = null,
    tx: Prisma.TransactionClient = prisma
  ) {
    return tx.eventRsvp.update({
      where: { id },
      data: {
        status,
        waitlistedAt,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: attendeeUserSelect,
        },
      },
    });
  },

  async findUserRsvps(userId: string, pagination: PaginationInput) {
    const where: Prisma.EventRsvpWhereInput = {
      userId,
      event: {
        deletedAt: null,
      },
    };

    const [rsvps, total] = await Promise.all([
      prisma.eventRsvp.findMany({
        where,
        include: {
          event: {
            include: {
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
            },
          },
        },
        orderBy: {
          event: {
            startsAt: 'asc',
          },
        },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.eventRsvp.count({ where }),
    ]);

    return { rsvps, total };
  },

  async findEventAttendees(
    eventId: string,
    status: RsvpStatus | 'ALL' = 'ALL',
    pagination: PaginationInput,
    q?: string
  ) {
    const where: Prisma.EventRsvpWhereInput = {
      eventId,
      ...(status !== 'ALL' ? { status } : {}),
    };

    if (q?.trim()) {
      const search = q.trim();
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [attendees, total] = await Promise.all([
      prisma.eventRsvp.findMany({
        where,
        include: {
          user: {
            select: attendeeUserSelect,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.eventRsvp.count({ where }),
    ]);

    return { attendees, total };
  },
};
