import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import {
  userRepository,
  type VerificationFilters,
} from '../../repositories/user.repository.js';
import { toPageMeta } from '../../utils/pagination.js';

export const adminService = {
  async listVerifications(universityId: string, filters: VerificationFilters) {
    const [users, total] = await userRepository.listVerifications(universityId, filters);
    return {
      users,
      meta: toPageMeta(filters.page, filters.limit, total),
    };
  },

  async reviewVerification(input: {
    userId: string;
    universityId: string;
    actorId: string;
    status: 'APPROVED' | 'REJECTED';
    reason?: string;
  }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    const reviewed = await userRepository.reviewVerification(
      input.userId,
      input.universityId,
      input.status,
      input.reason,
    );

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: input.status === 'APPROVED' ? 'user.verified' : 'user.verification_rejected',
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    return reviewed;
  },

  async verifyUser(input: { userId: string; universityId: string; actorId: string }) {
    return this.reviewVerification({
      ...input,
      status: 'APPROVED',
    });
  },

  async listUniversities() {
    const { prisma } = await import('../../config/database.js');
    return prisma.university.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        isActive: true,
        isDemo: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            jobs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async createUniversity(input: { name: string; slug: string; domain: string; actorId: string }) {
    const { prisma } = await import('../../config/database.js');
    const existing = await prisma.university.findFirst({
      where: {
        OR: [{ slug: input.slug }, { domain: input.domain }],
      },
    });
    if (existing) throw ApiError.conflict('A university with this slug or domain already exists.');

    const university = await prisma.university.create({
      data: {
        name: input.name,
        slug: input.slug,
        domain: input.domain,
        isActive: true,
        isDemo: false,
      },
    });

    await auditLogRepository.record({
      universityId: university.id,
      actorId: input.actorId,
      action: 'university.created',
      targetType: 'university',
      targetId: university.id,
    });

    return university;
  },

  async toggleUniversityStatus(id: string, isActive: boolean, actorId: string) {
    const { prisma } = await import('../../config/database.js');
    const university = await prisma.university.update({
      where: { id },
      data: { isActive },
    });

    await auditLogRepository.record({
      universityId: university.id,
      actorId,
      action: isActive ? 'university.activated' : 'university.deactivated',
      targetType: 'university',
      targetId: university.id,
    });

    return university;
  },

  async getStats(universityId: string, isSuperAdmin: boolean) {
    const { prisma } = await import('../../config/database.js');

    if (isSuperAdmin) {
      const [totalUniversities, totalUsers, totalJobs, pendingVerifications, auditLogsCount] = await Promise.all([
        prisma.university.count(),
        prisma.user.count(),
        prisma.job.count(),
        prisma.user.count({ where: { verificationStatus: 'PENDING' } }),
        prisma.auditLog.count(),
      ]);

      return {
        scope: 'PLATFORM',
        totalUniversities,
        totalUsers,
        totalJobs,
        pendingVerifications,
        auditLogsCount,
      };
    }

    const [totalStudents, totalAlumni, pendingVerifications, activeJobs, pendingJobs] = await Promise.all([
      prisma.user.count({ where: { universityId, role: { name: 'STUDENT' } } }),
      prisma.user.count({ where: { universityId, role: { name: 'ALUMNI' } } }),
      prisma.user.count({ where: { universityId, verificationStatus: 'PENDING' } }),
      prisma.job.count({ where: { universityId, status: 'APPROVED' } }),
      prisma.job.count({ where: { universityId, status: 'PENDING' } }),
    ]);

    return {
      scope: 'UNIVERSITY',
      totalStudents,
      totalAlumni,
      pendingVerifications,
      activeJobs,
      pendingJobs,
    };
  },
};
