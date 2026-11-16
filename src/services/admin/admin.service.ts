import crypto from 'node:crypto';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { emailService } from '../email/email.service.js';
import { notificationService } from '../notification/notification.service.js';
import { cacheService } from '../cache/cache.service.js';
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
      action: 'USER_SESSIONS_TERMINATED',
      targetType: 'user',
      targetId: input.userId,
    });

    await notificationService.notifyUser({
      userId: input.userId,
      type: 'SECURITY_ALERT',
      title: 'Sessions Terminated',
      body: 'An administrator terminated all your active device logins.',
      link: '/login',
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
        ? 'USER_VERIFIED'
        : input.status === 'REVOKED'
          ? 'USER_VERIFICATION_REVOKED'
          : 'USER_VERIFICATION_REJECTED';

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: auditAction,
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    await cacheService.bumpVersion('dir');

    if (input.status === 'APPROVED') {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'ACCOUNT_VERIFICATION',
        title: 'Accreditation Approved',
        body: 'Congratulations! Your alumni accreditation has been officially approved.',
        link: '/alumni/dashboard',
      });
    } else if (input.status === 'REJECTED') {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'MODERATION_RESULT',
        title: 'Accreditation Declined',
        body: `Your alumni accreditation was rejected: ${input.reason || 'Credentials could not be verified'}. Please update your academic details and resubmit.`,
        link: '/alumni/profile/edit',
      });
    }

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

  async listAuditLogs(
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      action?: string;
      actorId?: string;
      actorRole?: string;
      targetType?: string;
      result?: 'SUCCESS' | 'FAILURE';
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;

    const { logs, total } = await auditLogRepository.findPaginated(
      {
        search: filters.search,
        action: filters.action,
        actorId: filters.actorId,
        actorRole: filters.actorRole,
        targetType: filters.targetType,
        result: filters.result,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      { page, limit },
    );

    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        actorId: l.actorId,
        actorName: l.actor?.name ?? 'System / Anonymous',
        actorEmail: l.actor?.email ?? null,
        actorRole: l.actorRole ?? l.actor?.role?.name ?? 'SYSTEM',
        target: l.targetType ? `${l.targetType}${l.targetId ? `:${l.targetId}` : ''}` : 'System',
        targetType: l.targetType,
        targetId: l.targetId,
        result: l.result,
        ip: l.ip,
        userAgent: l.userAgent,
        requestId: l.requestId,
        details: l.metadata ? (typeof l.metadata === 'string' ? l.metadata : JSON.stringify(l.metadata)) : l.action,
        metadata: l.metadata,
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
        action: 'MODERATOR_INVITED',
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
        action: 'MODERATOR_INVITATION_RESENT',
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
        action: 'MODERATOR_INVITATION_REVOKED',
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
      action: input.isActive ? 'USER_RESTORED' : 'USER_SUSPENDED',
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    await cacheService.bumpVersion('dir');

    const roleName = targetUser.role?.name;
    const rolePrefix =
      roleName === 'SUPER_ADMIN'
        ? '/admin'
        : roleName === 'MODERATOR'
          ? '/moderator'
          : roleName === 'ALUMNI'
            ? '/alumni'
            : '/student';

    if (!input.isActive) {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'RESTRICTION_APPLIED',
        title: 'Account Suspended',
        body: `Your account access has been suspended by administration.${input.reason ? ` Reason: ${input.reason}` : ''}`,
        link: '/login',
      });
    } else {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'RESTRICTION_ENDED',
        title: 'Account Restored',
        body: 'Your account access has been fully restored. Welcome back.',
        link: `${rolePrefix}/dashboard`,
      });
    }

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
      action: 'UNIVERSITY_CREATED',
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
      action: isActive ? 'UNIVERSITY_ACTIVATED' : 'UNIVERSITY_DEACTIVATED',
      targetType: 'university',
      targetId: university.id,
    });

    return university;
  },
};
