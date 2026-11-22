import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { sessionRepository } from '../../repositories/session.repository.js';
import { sessionPresenter, type SessionDto } from '../../presenters/session.presenter.js';
import { cacheService } from '../cache/cache.service.js';

export const sessionService = {
  async listActiveSessions(userId: string, currentSessionId?: string | null): Promise<SessionDto[]> {
    const sessions = await sessionRepository.findActiveByUserId(userId);
    return sessionPresenter.toDtoList(sessions, currentSessionId);
  },

  async revokeSession(
    userId: string,
    universityId: string,
    sessionId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<{ success: boolean; isCurrentRevoked: boolean }> {
    const session = await sessionRepository.findById(sessionId);

    // IDOR protection & validation
    if (!session || session.userId !== userId) {
      throw ApiError.notFound('Active session not found or already terminated.');
    }

    if (session.revokedAt) {
      return { success: true, isCurrentRevoked: false };
    }

    await sessionRepository.revoke(sessionId);

    // Add session ID to Redis denylist for fast-path invalidation (7 days TTL)
    await cacheService.set(`denylist:token:${sessionId}`, 1, 60 * 60 * 24 * 7);

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'SESSION_REVOKED',
      targetType: 'session',
      targetId: sessionId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: {
        deviceName: session.deviceName,
        ipAddress: session.ipAddress,
      },
    });

    return { success: true, isCurrentRevoked: false };
  },

  async revokeOtherSessions(
    userId: string,
    universityId: string,
    currentSessionId?: string | null,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ): Promise<{ revokedCount: number }> {
    const result = await sessionRepository.revokeOthers(userId, currentSessionId);

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'SESSIONS_REVOKED_OTHERS',
      targetType: 'user',
      targetId: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: {
        revokedCount: result.count,
        preservedSessionId: currentSessionId,
      },
    });

    return { revokedCount: result.count };
  },
};
