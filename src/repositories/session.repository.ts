import { prisma } from '../config/database.js';

export interface CreateSessionRecordInput {
  id: string;
  tokenHash: string;
  familyId?: string | null;
  replacedByTokenHash?: string | null;
  userId: string;
  universityId: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceName?: string | null;
  lastActiveAt?: Date;
}

export const sessionRepository = {
  create(input: CreateSessionRecordInput) {
    return prisma.refreshToken.create({ data: input });
  },

  findById(id: string) {
    return prisma.refreshToken.findUnique({
      where: { id },
    });
  },

  findActiveById(id: string) {
    return prisma.refreshToken.findFirst({
      where: { id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  findActiveByUserId(userId: string) {
    return prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  },

  revoke(id: string, replacedByTokenHash?: string) {
    return prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        ...(replacedByTokenHash ? { replacedByTokenHash } : {}),
      },
    });
  },

  revokeOthers(userId: string, keepSessionId?: string | null) {
    return prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  },

  touch(id: string) {
    return prisma.refreshToken
      .update({
        where: { id },
        data: { lastActiveAt: new Date() },
      })
      .catch(() => null);
  },
};
