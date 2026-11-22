import type { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../errors/api-error.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { passwordService } from '../auth/password.service.js';
import { cacheService } from '../cache/cache.service.js';

export const accountService = {
  async getAccountSummary(userId: string) {
    const user = await accountRepository.findAccountUser(userId);
    if (!user) throw ApiError.unauthorized('Account unavailable.');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
      verified: user.verified,
      verificationStatus: user.verificationStatus,
      university: {
        id: user.university.id,
        name: user.university.name,
        domain: user.university.domain,
      },
      deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      recentExports: user.dataExports.map((e) => ({
        id: e.id,
        status: e.status,
        expiresAt: e.expiresAt.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
    };
  },

  async requestDataExport(
    userId: string,
    universityId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    // 1-hour rate limit per user
    const oneHourMs = 60 * 60 * 1000;
    const recent = await accountRepository.findRecentDataExport(userId, oneHourMs);
    if (recent) {
      throw new ApiError(
        429,
        'You have requested a data export recently. Please allow at least 1 hour between export requests.',
        'TOO_MANY_REQUESTS',
      );
    }

    const payload = await accountRepository.compileSanitizedUserData(userId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const record = await accountRepository.createDataExportRequest({
      userId,
      payload: payload as unknown as Prisma.InputJsonValue,
      expiresAt,
    });

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'DATA_EXPORT_REQUESTED',
      targetType: 'user',
      targetId: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: {
        exportId: record.id,
      },
    });

    return {
      exportId: record.id,
      expiresAt: record.expiresAt.toISOString(),
      data: payload,
    };
  },

  async deactivateAccount(
    userId: string,
    universityId: string,
    currentPassword: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const user = await accountRepository.findUserWithPassword(userId);
    if (!user) throw ApiError.unauthorized('Account unavailable.');

    const isValidPassword = await passwordService.verify(user.passwordHash, currentPassword);
    if (!isValidPassword) {
      if (universityId) {
        await auditLogRepository.record({
          universityId,
          actorId: userId,
          action: 'ACCOUNT_DEACTIVATION_FAILED',
          targetType: 'user',
          targetId: userId,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          requestId: meta?.requestId,
          metadata: { reason: 'CURRENT_PASSWORD_INVALID' },
        });
      }
      throw new ApiError(400, 'Current password does not match records.', 'CURRENT_PASSWORD_INVALID');
    }

    await accountRepository.deactivateUser(userId);
    await tokenRepository.revokeByUserId(userId);
    await cacheService.bumpVersion('dir');
    await cacheService.bumpVersion('jobs');

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'ACCOUNT_DEACTIVATED',
      targetType: 'user',
      targetId: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });

    return { success: true };
  },

  async deleteAccount(
    userId: string,
    universityId: string,
    currentPassword: string,
    confirmText: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    if (confirmText !== 'DELETE') {
      throw ApiError.badRequest("You must type 'DELETE' exactly to confirm account deletion.");
    }

    const user = await accountRepository.findUserWithPassword(userId);
    if (!user) throw ApiError.unauthorized('Account unavailable.');

    const isValidPassword = await passwordService.verify(user.passwordHash, currentPassword);
    if (!isValidPassword) {
      if (universityId) {
        await auditLogRepository.record({
          universityId,
          actorId: userId,
          action: 'ACCOUNT_DELETION_FAILED',
          targetType: 'user',
          targetId: userId,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          requestId: meta?.requestId,
          metadata: { reason: 'CURRENT_PASSWORD_INVALID' },
        });
      }
      throw new ApiError(400, 'Current password does not match records.', 'CURRENT_PASSWORD_INVALID');
    }

    await accountRepository.requestUserDeletion(userId);
    await accountRepository.closeUserJobs(userId);
    await tokenRepository.revokeByUserId(userId);
    await cacheService.bumpVersion('dir');
    await cacheService.bumpVersion('jobs');

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'ACCOUNT_DELETION_REQUESTED',
      targetType: 'user',
      targetId: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { gracePeriodDays: 30 },
    });

    return {
      success: true,
      gracePeriodDays: 30,
    };
  },
};
