import crypto from 'node:crypto';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { emailService } from '../email/email.service.js';
import {
  userRepository,
  type VerificationFilters,
  type AdminUserFilters,
} from '../../repositories/user.repository.js';
import { toPageMeta } from '../../utils/pagination.js';

export const adminService = {
  async listUsers(universityId: string, filters: AdminUserFilters) {
    const [users, total] = await userRepository.listAdminUsers(universityId, filters);
    return {
      users,
      meta: toPageMeta(filters.page, filters.limit, total),
    };
  },

  async getUserDetail(userId: string, universityId: string) {
    const detail = await userRepository.findUserDetailForAdmin(userId, universityId);
    if (!detail) {
      throw ApiError.notFound('User');
    }
    return detail;
  },

  async terminateUserSessions(input: { userId: string; universityId: string; actorId: string }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    await tokenRepository.revokeByUserId(input.userId);

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'user.sessions_terminated',
      targetType: 'user',
      targetId: input.userId,
    });

    return {
      success: true,
      message: 'All active sessions for this user have been terminated.',
    };
  },

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
    status: 'APPROVED' | 'REJECTED' | 'REVOKED';
    reason?: string;
  }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    // Unverified students or alumni cannot be accredited before email verification
    if (input.status === 'APPROVED' && !target.verified) {
      throw ApiError.badRequest(
        'User must verify their email address before administrative accreditation approval.',
      );
    }

    const reviewed = await userRepository.reviewVerification(
      input.userId,
      input.universityId,
      input.status,
      input.reason,
    );

    // If rejected or revoked, immediately invalidate active sessions for security
    if (input.status === 'REJECTED' || input.status === 'REVOKED') {
      await tokenRepository.revokeByUserId(input.userId);
    }

    // Send decision email
    if (input.status === 'APPROVED' || input.status === 'REJECTED') {
      await emailService.sendVerificationDecisionEmail(
        target.email,
        target.name,
        input.status,
        input.reason,
      );
    }

    const auditAction =
      input.status === 'APPROVED'
        ? 'user.verified'
        : input.status === 'REVOKED'
          ? 'user.verification_revoked'
          : 'user.verification_rejected';

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: auditAction,
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

  async getStats() {
    const { prisma } = await import('../../config/database.js');

    const [
      totalStudents,
      totalAlumni,
      totalModerators,
      pendingVerifications,
      totalJobs,
      pendingJobs,
      auditLogsCount,
    ] = await Promise.all([
      prisma.user.count({ where: { role: { name: 'STUDENT' } } }),
      prisma.user.count({ where: { role: { name: 'ALUMNI' } } }),
      prisma.user.count({ where: { role: { name: 'MODERATOR' } } }),
      prisma.user.count({ where: { verificationStatus: 'PENDING' } }),
      prisma.job.count({ where: { status: 'APPROVED' } }),
      prisma.job.count({ where: { status: 'PENDING' } }),
      prisma.auditLog.count(),
    ]);

    return {
      scope: 'PLATFORM',
      totalStudents,
      totalAlumni,
      totalModerators,
      pendingVerifications,
      totalJobs,
      pendingJobs,
      auditLogsCount,
    };
  },

  async listAuditLogs(page = 1, limit = 50) {
    const { prisma } = await import('../../config/database.js');
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
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
      prisma.auditLog.count(),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        actorName: l.actor.name,
        actorRole: l.actor.role.name,
        target: l.targetType ? `${l.targetType}:${l.targetId ?? ''}` : 'System',
        details: l.metadata ? JSON.stringify(l.metadata) : l.action,
        timestamp: l.createdAt.toISOString(),
      })),
      meta: toPageMeta(page, limit, total),
    };
  },

  async inviteModerator(input: { email: string; actorId: string }) {
    const { prisma } = await import('../../config/database.js');
    const normalizedEmail = input.email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw ApiError.conflict('A user with this email address already exists.');
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000); // 72 hours

    const invitation = await prisma.moderatorInvitation.upsert({
      where: { email: normalizedEmail },
      update: {
        tokenHash,
        expiresAt,
        revokedAt: null,
        acceptedAt: null,
        invitedBy: { connect: { id: input.actorId } },
      },
      create: {
        email: normalizedEmail,
        tokenHash,
        expiresAt,
        invitedBy: { connect: { id: input.actorId } },
      },
    });

    const emailResult = await emailService.sendModeratorInvitationEmail(normalizedEmail, plainToken);

    const university = await prisma.university.findFirst();
    if (university) {
      await auditLogRepository.record({
        universityId: university.id,
        actorId: input.actorId,
        action: 'moderator.invited',
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: { email: normalizedEmail },
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      setupUrl: emailResult.setupUrl,
    };
  },

  async listModeratorInvitations() {
    const { prisma } = await import('../../config/database.js');
    return prisma.moderatorInvitation.findMany({
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async resendModeratorInvitation(id: string, actorId: string) {
    const { prisma } = await import('../../config/database.js');
    const invitation = await prisma.moderatorInvitation.findUnique({ where: { id } });
    if (!invitation) throw ApiError.notFound('Invitation');
    if (invitation.acceptedAt) throw ApiError.badRequest('This invitation has already been accepted.');

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000);

    await prisma.moderatorInvitation.update({
      where: { id },
      data: { tokenHash, expiresAt, revokedAt: null },
    });

    const emailResult = await emailService.sendModeratorInvitationEmail(invitation.email, plainToken);

    const university = await prisma.university.findFirst();
    if (university) {
      await auditLogRepository.record({
        universityId: university.id,
        actorId,
        action: 'moderator.invitation_resent',
        targetType: 'invitation',
        targetId: invitation.id,
      });
    }

    return {
      success: true,
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      setupUrl: emailResult.setupUrl,
    };
  },

  async revokeModeratorInvitation(id: string, actorId: string) {
    const { prisma } = await import('../../config/database.js');
    const invitation = await prisma.moderatorInvitation.findUnique({ where: { id } });
    if (!invitation) throw ApiError.notFound('Invitation');
    if (invitation.acceptedAt) throw ApiError.badRequest('Cannot revoke an already accepted invitation.');

    await prisma.moderatorInvitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    const university = await prisma.university.findFirst();
    if (university) {
      await auditLogRepository.record({
        universityId: university.id,
        actorId,
        action: 'moderator.invitation_revoked',
        targetType: 'invitation',
        targetId: invitation.id,
      });
    }

    return { success: true, message: 'Invitation revoked.' };
  },

  async toggleUserSuspension(input: {
    userId: string;
    isActive: boolean;
    reason?: string;
    actorId: string;
  }) {
    const { prisma } = await import('../../config/database.js');
    if (input.userId === input.actorId) {
      throw ApiError.badRequest('You cannot suspend or deactivate your own Super Admin account.');
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { role: true },
    });
    if (!targetUser) throw ApiError.notFound('User');

    // Protect last active Super Admin
    if (targetUser.role.name === 'SUPER_ADMIN' && !input.isActive) {
      const activeSuperAdmins = await prisma.user.count({
        where: { role: { name: 'SUPER_ADMIN' }, isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw ApiError.badRequest('The last remaining active Super Admin cannot be suspended.');
      }
    }

    const updated = await prisma.user.update({
      where: { id: input.userId },
      data: { isActive: input.isActive },
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (!input.isActive) {
      await tokenRepository.revokeByUserId(input.userId);
    }

    await auditLogRepository.record({
      universityId: targetUser.universityId,
      actorId: input.actorId,
      action: input.isActive ? 'user.restored' : 'user.suspended',
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    return updated;
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
};
