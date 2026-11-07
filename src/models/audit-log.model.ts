import { prisma } from '../config/database.js';
import type { Prisma, Role, AuditResult } from '@prisma/client';

export const auditLogModel = {
  record(data: {
    actorId?: string;
    actorRole?: Role;
    action: string;
    targetType?: string;
    targetId?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    metadata?: Prisma.InputJsonValue;
    result?: AuditResult;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        actorRole: data.actorRole,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        ip: data.ip,
        userAgent: data.userAgent,
        requestId: data.requestId,
        metadata: data.metadata ?? undefined,
        result: data.result ?? 'SUCCESS',
      },
    });
  },

  list(options: {
    action?: string;
    targetType?: string;
    actorId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AuditLogWhereInput = {};

    if (options.action) where.action = options.action;
    if (options.targetType) where.targetType = options.targetType;
    if (options.actorId) where.actorId = options.actorId;

    return Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: options.skip ?? 0,
        take: options.take ?? 50,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);
  },
};
