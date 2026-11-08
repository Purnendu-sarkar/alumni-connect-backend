import crypto from 'node:crypto';
import { JobStatus, Role, TokenType, UserStatus, VerificationStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogModel } from '../../models/audit-log.model.js';
import { passwordService } from '../auth/password.service.js';
import { emailService } from '../email/email.service.js';

export const adminService = {
  async reviewVerification(input: {
    userId: string;
    reviewerId: string;
    status: 'APPROVED' | 'REJECTED';
    reason?: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      include: { profile: true },
    });

    if (!user) throw ApiError.notFound('User');

    const nextVerificationStatus =
      input.status === 'APPROVED' ? VerificationStatus.APPROVED : VerificationStatus.REJECTED;
    const nextUserStatus =
      input.status === 'APPROVED' ? UserStatus.ACTIVE : UserStatus.VERIFICATION_REJECTED;

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

    // Dispatch approval or rejection notification to the user's institutional email
    if (input.status === 'APPROVED') {
      await emailService
        .sendAlumniApprovalEmail(user.email, user.profile?.fullName ?? user.email)
        .catch(() => {});
    } else {
      await emailService
        .sendAlumniRejectionEmail(user.email, user.profile?.fullName ?? user.email, input.reason)
        .catch(() => {});
    }

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

  async inviteAdmin(input: {
    inviterId: string;
    email: string;
    fullName: string;
    role: 'MODERATOR' | 'SUPER_ADMIN';
    department?: string;
  }) {
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour valid setup window
    const placeholderSecret = crypto.randomUUID() + crypto.randomBytes(16).toString('hex');
    const initialPasswordHash = await passwordService.hash(placeholderSecret);

    const inviter = await prisma.user.findUnique({
      where: { id: input.inviterId },
      include: { profile: true },
    });
    const inviterName = inviter?.profile?.fullName || inviter?.email || 'Platform Super Admin';
    const targetRole = input.role === 'SUPER_ADMIN' ? Role.SUPER_ADMIN : Role.MODERATOR;

    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: initialPasswordHash,
          role: targetRole,
          status: UserStatus.PENDING_SETUP,
          verificationStatus: VerificationStatus.NOT_REQUIRED,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          fullName: input.fullName,
          department: input.department ?? 'Administration',
          currentJob: targetRole === Role.SUPER_ADMIN ? 'Super Administrator' : 'Platform Moderator',
        },
      });

      await tx.privacySetting.create({
        data: {
          userId: user.id,
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          type: TokenType.ACCOUNT_SETUP,
          expiresAt,
        },
      });

      return user;
    });

    if (targetRole === Role.SUPER_ADMIN) {
      await emailService.sendSuperAdminInvitationEmail(email, input.fullName, plainToken, inviterName);
    } else {
      await emailService.sendModeratorInvitationEmail(email, input.fullName, plainToken, inviterName);
    }

    await auditLogModel.record({
      actorId: input.inviterId,
      actorRole: Role.SUPER_ADMIN,
      action: `INVITATION_SENT_${targetRole}`,
      targetType: 'User',
      targetId: newUser.id,
      metadata: { email, role: targetRole },
    });

    return {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
    };
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
    const [
      totalUsers,
      totalStudents,
      totalAlumni,
      totalModerators,
      totalSuperAdmins,
      activeUsers,
      activeJobs,
      pendingVerifications,
      totalConnections,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.user.count({ where: { role: Role.ALUMNI } }),
      prisma.user.count({ where: { role: Role.MODERATOR } }),
      prisma.user.count({ where: { role: Role.SUPER_ADMIN } }),
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.job.count({ where: { status: JobStatus.PUBLISHED } }),
      prisma.user.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
      prisma.connection.count({ where: { status: 'ACCEPTED' } }),
    ]);

    return {
      totalUsers,
      totalStudents,
      totalAlumni,
      totalModerators,
      totalSuperAdmins,
      activeUsers,
      activeJobs,
      pendingVerifications,
      totalConnections,
    };
  },

  listAuditLogs(options: { action?: string; targetType?: string; skip?: number; take?: number }) {
    return auditLogModel.list(options);
  },
};
