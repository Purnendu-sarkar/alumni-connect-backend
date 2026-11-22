import { prisma } from '../config/database.js';
import type { RestrictionType, UserRestriction } from '../generated/prisma/client.js';

export const restrictionRepository = {
  async findActiveRestriction(
    userId: string,
    type: RestrictionType,
  ): Promise<UserRestriction | null> {
    const now = new Date();
    return prisma.userRestriction.findFirst({
      where: {
        userId,
        type,
        revokedAt: null,
        endsAt: { gt: now },
      },
      orderBy: { endsAt: 'desc' },
    });
  },

  async findActiveRestrictionsByUser(userId: string): Promise<UserRestriction[]> {
    const now = new Date();
    return prisma.userRestriction.findMany({
      where: {
        userId,
        revokedAt: null,
        endsAt: { gt: now },
      },
      orderBy: { endsAt: 'desc' },
    });
  },

  async createRestriction(data: {
    universityId: string;
    userId: string;
    type: RestrictionType;
    reason: string;
    endsAt: Date;
    createdById: string;
    sourceReportId?: string;
  }): Promise<UserRestriction> {
    return prisma.userRestriction.create({
      data: {
        universityId: data.universityId,
        userId: data.userId,
        type: data.type,
        reason: data.reason,
        endsAt: data.endsAt,
        createdById: data.createdById,
        sourceReportId: data.sourceReportId,
      },
    });
  },

  async findById(id: string): Promise<UserRestriction | null> {
    return prisma.userRestriction.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  async revokeRestriction(
    id: string,
    revokedById: string,
    revokeReason: string,
  ): Promise<UserRestriction> {
    return prisma.userRestriction.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedById,
        revokeReason,
      },
    });
  },

  async revokeBySourceReport(
    reportId: string,
    revokedById: string,
    revokeReason: string,
  ): Promise<number> {
    const result = await prisma.userRestriction.updateMany({
      where: {
        sourceReportId: reportId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedById,
        revokeReason,
      },
    });
    return result.count;
  },
};
