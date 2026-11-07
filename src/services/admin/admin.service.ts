import { JobStatus, Role, UserStatus, VerificationStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogModel } from '../../models/audit-log.model.js';

export const adminService = {
  async reviewVerification(input: {
    userId: string;
    reviewerId: string;
    status: 'APPROVED' | 'REJECTED';
    reason?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
    });

    if (!user) throw ApiError.notFound('User');

    const nextVerificationStatus =
      input.status === 'APPROVED' ? VerificationStatus.APPROVED : VerificationStatus.REJECTED;
    const nextUserStatus =
      input.status === 'APPROVED' ? UserStatus.ACTIVE : user.status;

    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: {
        verificationStatus: nextVerificationStatus,
        status: nextUserStatus,
        verifiedAt: input.status === 'APPROVED' ? new Date() : undefined,
        verifiedById: input.reviewerId,
        verificationNote: input.reason,
      },
      include: {
        profile: true,
      },
    });

    await auditLogModel.record({
      actorId: input.reviewerId,
      actorRole: Role.SUPER_ADMIN,
      action: `USER_VERIFICATION_${input.status}`,
      targetType: 'User',
      targetId: user.id,
      metadata: { reason: input.reason },
    });

    return updated;
  },

  async listVerifications(options: {
    role?: Role;
    status?: VerificationStatus;
    skip?: number;
    take?: number;
  }) {
    const where = {
      verificationStatus: options.status ?? VerificationStatus.PENDING,
      ...(options.role ? { role: options.role } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: options.skip ?? 0,
        take: options.take ?? 50,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  },

  async getPlatformStats() {
    const [totalUsers, activeJobs, pendingVerifications, totalConnections] = await Promise.all([
      prisma.user.count(),
      prisma.job.count({ where: { status: JobStatus.PUBLISHED } }),
      prisma.user.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
      prisma.connection.count({ where: { status: 'ACCEPTED' } }),
    ]);

    return {
      totalUsers,
      activeJobs,
      pendingVerifications,
      totalConnections,
    };
  },

  listAuditLogs(options: { action?: string; targetType?: string; skip?: number; take?: number }) {
    return auditLogModel.list(options);
  },
};
