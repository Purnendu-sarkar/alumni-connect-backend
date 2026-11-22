import { prisma } from '../config/database.js';

export const tokenRepository = {
  create(input: {
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
  }) {
    return prisma.refreshToken.create({ data: input });
  },

  findActiveSessionsByUserId(userId: string) {
    return prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  },

  revokeOtherSessions(userId: string, keepSessionId?: string | null) {
    return prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepSessionId ? { id: { not: keepSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  },

  touchLastActive(id: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    }).catch(() => null);
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

  findByTokenHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
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

  revokeFamily(familyId: string) {
    return prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeByUserId(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },
};
