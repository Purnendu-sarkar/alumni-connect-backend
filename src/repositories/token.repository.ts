import { prisma } from '../config/database.js';

export const tokenRepository = {
  create(input: {
    id: string;
    tokenHash: string;
    userId: string;
    universityId: string;
    expiresAt: Date;
  }) {
    return prisma.refreshToken.create({ data: input });
  },

  findActiveById(id: string) {
    return prisma.refreshToken.findFirst({
      where: { id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  },

  revoke(id: string) {
    return prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
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
