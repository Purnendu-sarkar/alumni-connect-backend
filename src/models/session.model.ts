import { prisma } from '../config/database.js';

export const sessionModel = {
  create(data: {
    userId: string;
    refreshTokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }) {
    return prisma.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent,
        ip: data.ip,
      },
    });
  },

  findByTokenHash(refreshTokenHash: string) {
    return prisma.session.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.session.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
  },

  updateReauth(id: string, reauthUntil: Date) {
    return prisma.session.update({
      where: { id },
      data: { reauthUntil },
    });
  },

  revoke(id: string, reason = 'LOGOUT') {
    return prisma.session.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  },

  revokeFamily(familyId: string, reason = 'REPLAY_DETECTED') {
    return prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  },

  revokeAllForUser(userId: string, reason = 'SECURITY_RESET') {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  },
};
