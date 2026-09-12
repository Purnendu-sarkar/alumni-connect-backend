import type { ConnectionStatus } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export const connectionRepository = {
  findBetweenUsers(universityId: string, firstUserId: string, secondUserId: string) {
    return prisma.connection.findFirst({
      where: {
        universityId,
        OR: [
          { requesterId: firstUserId, recipientId: secondUserId },
          { requesterId: secondUserId, recipientId: firstUserId },
        ],
      },
    });
  },

  create(input: {
    universityId: string;
    requesterId: string;
    recipientId: string;
    message?: string;
  }) {
    return prisma.connection.create({ data: input });
  },

  findById(id: string) {
    return prisma.connection.findUnique({ where: { id } });
  },

  updateStatus(id: string, status: Extract<ConnectionStatus, 'ACCEPTED' | 'DECLINED'>) {
    return prisma.connection.update({
      where: { id },
      data: { status, respondedAt: new Date() },
    });
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
};
