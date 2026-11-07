import { prisma } from '../config/database.js';
import { ConnectionStatus } from '@prisma/client';

export function getNormalizedPair(idA: string, idB: string): { userLowId: string; userHighId: string } {
  return idA < idB ? { userLowId: idA, userHighId: idB } : { userLowId: idB, userHighId: idA };
}

export const connectionModel = {
  findPair(idA: string, idB: string) {
    const { userLowId, userHighId } = getNormalizedPair(idA, idB);
    return prisma.connection.findUnique({
      where: {
        userLowId_userHighId: {
          userLowId,
          userHighId,
        },
      },
      include: {
        requester: { include: { profile: true } },
        receiver: { include: { profile: true } },
      },
    });
  },

  createRequest(data: {
    requesterId: string;
    receiverId: string;
    note?: string;
  }) {
    const { userLowId, userHighId } = getNormalizedPair(data.requesterId, data.receiverId);
    return prisma.connection.create({
      data: {
        requesterId: data.requesterId,
        receiverId: data.receiverId,
        userLowId,
        userHighId,
        status: ConnectionStatus.PENDING,
        note: data.note,
      },
      include: {
        requester: { include: { profile: true } },
        receiver: { include: { profile: true } },
      },
    });
  },

  updateStatus(id: string, status: ConnectionStatus, extra: { respondedAt?: Date; rejectedAt?: Date; cancelledAt?: Date } = {}) {
    return prisma.connection.update({
      where: { id },
      data: {
        status,
        ...extra,
      },
      include: {
        requester: { include: { profile: true } },
        receiver: { include: { profile: true } },
      },
    });
  },

  listUserConnections(userId: string, options: { status?: ConnectionStatus; skip?: number; take?: number } = {}) {
    const where = {
      OR: [{ requesterId: userId }, { receiverId: userId }],
      ...(options.status ? { status: options.status } : {}),
    };

    return Promise.all([
      prisma.connection.findMany({
        where,
        skip: options.skip ?? 0,
        take: options.take ?? 20,
        orderBy: { updatedAt: 'desc' },
        include: {
          requester: { include: { profile: true } },
          receiver: { include: { profile: true } },
        },
      }),
      prisma.connection.count({ where }),
    ]);
  },
};

