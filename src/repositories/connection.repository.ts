import type { ConnectionStatus, Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export const connectionRepository = {
  getNormalizedPair(firstUserId: string, secondUserId: string) {
    const [userLowId, userHighId] = [firstUserId, secondUserId].sort();
    return { userLowId, userHighId };
  },

  findBetweenUsers(universityId: string, firstUserId: string, secondUserId: string) {
    const { userLowId, userHighId } = this.getNormalizedPair(firstUserId, secondUserId);
    return prisma.connection.findFirst({
      where: {
        universityId,
        OR: [
          { userLowId, userHighId },
          { requesterId: firstUserId, recipientId: secondUserId },
          { requesterId: secondUserId, recipientId: firstUserId },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  create(input: {
    universityId: string;
    requesterId: string;
    recipientId: string;
    message?: string;
  }) {
    const { userLowId, userHighId } = this.getNormalizedPair(input.requesterId, input.recipientId);
    return prisma.connection.create({
      data: {
        ...input,
        userLowId,
        userHighId,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.connection.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  updateStatus(
    id: string,
    status: ConnectionStatus,
    extraData: { rejectedAt?: Date | null; respondedAt?: Date | null } = {},
  ) {
    return prisma.connection.update({
      where: { id },
      data: {
        status,
        respondedAt: extraData.respondedAt ?? (status === 'ACCEPTED' || status === 'DECLINED' ? new Date() : undefined),
        rejectedAt: extraData.rejectedAt ?? (status === 'REJECTED' || status === 'DECLINED' ? new Date() : undefined),
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  remove(id: string) {
    return prisma.connection.delete({
      where: { id },
    });
  },

  deleteBetweenUsers(firstUserId: string, secondUserId: string) {
    const { userLowId, userHighId } = this.getNormalizedPair(firstUserId, secondUserId);
    return prisma.connection.deleteMany({
      where: {
        OR: [
          { userLowId, userHighId },
          { requesterId: firstUserId, recipientId: secondUserId },
          { requesterId: secondUserId, recipientId: firstUserId },
        ],
      },
    });
  },

  async listForUserWithTab(
    universityId: string,
    userId: string,
    tab: 'connected' | 'received' | 'sent',
    options: { q?: string; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const skip = (page - 1) * limit;

    let where: Prisma.ConnectionWhereInput;

    if (tab === 'connected') {
      where = {
        universityId,
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { recipientId: userId }],
      };
      if (options.q?.trim()) {
        const query = options.q.trim();
        where.AND = [
          {
            OR: [
              {
                requester: {
                  AND: [
                    { id: { not: userId } },
                    {
                      OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { currentCompany: { contains: query, mode: 'insensitive' } },
                        { department: { contains: query, mode: 'insensitive' } },
                      ],
                    },
                  ],
                },
              },
              {
                recipient: {
                  AND: [
                    { id: { not: userId } },
                    {
                      OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { currentCompany: { contains: query, mode: 'insensitive' } },
                        { department: { contains: query, mode: 'insensitive' } },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ];
      }
    } else if (tab === 'received') {
      where = {
        universityId,
        status: 'PENDING',
        recipientId: userId,
      };
      if (options.q?.trim()) {
        const query = options.q.trim();
        where.requester = {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { currentCompany: { contains: query, mode: 'insensitive' } },
            { department: { contains: query, mode: 'insensitive' } },
          ],
        };
      }
    } else {
      // sent
      where = {
        universityId,
        status: 'PENDING',
        requesterId: userId,
      };
      if (options.q?.trim()) {
        const query = options.q.trim();
        where.recipient = {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { currentCompany: { contains: query, mode: 'insensitive' } },
            { department: { contains: query, mode: 'insensitive' } },
          ],
        };
      }
    }

    const [items, total] = await Promise.all([
      prisma.connection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              email: true,
              batch: true,
              department: true,
              currentCompany: true,
              position: true,
              role: { select: { name: true } },
            },
          },
          recipient: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              email: true,
              batch: true,
              department: true,
              currentCompany: true,
              position: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
      prisma.connection.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  listForUser(universityId: string, userId: string) {
    return prisma.connection.findMany({
      where: { universityId, OR: [{ requesterId: userId }, { recipientId: userId }] },
      include: {
        requester: { select: { id: true, name: true, avatarUrl: true, currentCompany: true } },
        recipient: { select: { id: true, name: true, avatarUrl: true, currentCompany: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async countPendingReceived(userId: string): Promise<number> {
    return prisma.connection.count({
      where: {
        recipientId: userId,
        status: 'PENDING',
      },
    });
  },
};
