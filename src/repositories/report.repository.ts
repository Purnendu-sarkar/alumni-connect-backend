import { prisma } from '../config/database.js';
import type { Prisma, Report, ReportAction, ReportStatus, ReportType, RoleName } from '../generated/prisma/client.js';

export interface ReportFilterOptions {
  status?: ReportStatus;
  type?: ReportType;
  targetType?: string;
  q?: string;
  escalated?: boolean;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export const reportRepository = {
  async create(data: {
    universityId: string;
    reportedById: string;
    reportedUserId?: string | null;
    targetType: string;
    targetId: string;
    type: ReportType;
    reason: string;
    snapshot?: Prisma.InputJsonValue;
  }): Promise<Report> {
    return prisma.report.create({
      data: {
        universityId: data.universityId,
        reportedById: data.reportedById,
        reportedUserId: data.reportedUserId,
        targetType: data.targetType,
        targetId: data.targetId,
        type: data.type,
        reason: data.reason,
        snapshot: data.snapshot,
        status: 'OPEN',
      },
    });
  },

  async findById(id: string, universityId?: string) {
    const where: Prisma.ReportWhereInput = { id };
    if (universityId) {
      where.universityId = universityId;
    }

    return prisma.report.findFirst({
      where,
      include: {
        reportedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
        reportedUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
          },
        },
        actions: {
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  },

  async findOpenReportByTarget(
    reportedById: string,
    targetType: string,
    targetId: string,
  ): Promise<Report | null> {
    return prisma.report.findFirst({
      where: {
        reportedById,
        targetType,
        targetId,
        status: { in: ['OPEN', 'UNDER_REVIEW', 'REVIEWED'] },
      },
    });
  },

  async countLinkedReports(
    targetType: string,
    targetId: string,
    excludeId?: string,
  ): Promise<number> {
    return prisma.report.count({
      where: {
        targetType,
        targetId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  async findPaginated(
    universityId: string,
    filters: ReportFilterOptions,
    pagination: PaginationOptions,
  ) {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ReportWhereInput = {
      universityId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.targetType) {
      where.targetType = filters.targetType;
    }

    if (filters.escalated === true) {
      where.escalatedAt = { not: null };
    } else if (filters.escalated === false) {
      where.escalatedAt = null;
    }

    if (filters.q) {
      where.OR = [
        { reason: { contains: filters.q, mode: 'insensitive' } },
        { targetId: { contains: filters.q, mode: 'insensitive' } },
        { resolutionNote: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { status: 'asc' }, // OPEN / UNDER_REVIEW first
          { createdAt: 'desc' },
        ],
        include: {
          reportedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: { select: { name: true } },
            },
          },
          reportedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: { select: { name: true } },
            },
          },
          reviewer: {
            select: {
              id: true,
              name: true,
              email: true,
              role: { select: { name: true } },
            },
          },
          resolver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: { select: { name: true } },
            },
          },
          _count: {
            select: {
              actions: true,
            },
          },
        },
      }),
    ]);

    return { total, reports };
  },

  async update(id: string, data: Prisma.ReportUpdateInput): Promise<Report> {
    return prisma.report.update({
      where: { id },
      data,
    });
  },

  async createAction(data: {
    reportId: string;
    actorId: string;
    actorRole: RoleName;
    actionType: string;
    note?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): Promise<ReportAction> {
    return prisma.reportAction.create({
      data: {
        reportId: data.reportId,
        actorId: data.actorId,
        actorRole: data.actorRole,
        actionType: data.actionType,
        note: data.note,
        metadata: data.metadata,
      },
    });
  },
};
