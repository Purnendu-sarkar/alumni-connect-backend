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
  }) {
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
