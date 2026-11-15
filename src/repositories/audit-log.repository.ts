import type { AuditResult, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';

export interface AuditLogRecordInput {
  universityId: string;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  result?: AuditResult | 'SUCCESS' | 'FAILURE';
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogFilterOptions {
  search?: string;
  action?: string;
  actorId?: string;
  actorRole?: string;
  targetType?: string;
  result?: AuditResult | 'SUCCESS' | 'FAILURE';
  startDate?: Date;
  endDate?: Date;
  universityId?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export const auditLogRepository = {
  async record(input: AuditLogRecordInput) {
    try {
      let universityId = input.universityId;
      if (universityId) {
        const uniExists = await prisma.university.findUnique({
          where: { id: universityId },
          select: { id: true },
        });
        if (!uniExists) {
          const fallbackUni = await prisma.university.findFirst({ select: { id: true } });
          universityId = fallbackUni?.id ?? '';
        }
      } else {
        const uni = await prisma.university.findFirst({ select: { id: true } });
        universityId = uni?.id ?? '';
      }
      if (!universityId) return null;

      let validActorId = input.actorId ?? null;
      if (validActorId) {
        const userExists = await prisma.user.findUnique({
          where: { id: validActorId },
          select: { id: true },
        });
        if (!userExists) {
          validActorId = null;
        }
      }

      return await prisma.auditLog.create({
        data: {
          universityId,
          actorId: validActorId,
          actorRole: input.actorRole ?? null,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          result: input.result ?? 'SUCCESS',
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch {
      // In compliance audit logging, recording failure must be safely non-blocking
      return null;
    }
  },

  async findPaginated(filters: AuditLogFilterOptions, pagination: PaginationOptions) {
    const { page, limit } = pagination;
    const where: Prisma.AuditLogWhereInput = {};

    if (filters.universityId) {
      where.universityId = filters.universityId;
    }

    if (filters.action) {
      where.action = { equals: filters.action, mode: 'insensitive' };
    }

    if (filters.actorId) {
      where.actorId = filters.actorId;
    }

    if (filters.actorRole) {
      where.actorRole = { equals: filters.actorRole, mode: 'insensitive' };
    }

    if (filters.targetType) {
      where.targetType = { equals: filters.targetType, mode: 'insensitive' };
    }

    if (filters.result) {
      where.result = filters.result as AuditResult;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { action: { contains: term, mode: 'insensitive' } },
        { targetType: { contains: term, mode: 'insensitive' } },
        { targetId: { contains: term, mode: 'insensitive' } },
        { ip: { contains: term, mode: 'insensitive' } },
        { requestId: { contains: term, mode: 'insensitive' } },
        { actorRole: { contains: term, mode: 'insensitive' } },
        { actor: { name: { contains: term, mode: 'insensitive' } } },
        { actor: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },
};
