import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { notificationService } from '../notification/notification.service.js';

export const connectionService = {
  async create(input: {
    universityId: string;
    requesterId: string;
    recipientId: string;
    message?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    if (input.requesterId === input.recipientId) {
      throw ApiError.unprocessable('You cannot send a connection request to yourself.');
    }

    // 1. Check bidirectional block
    const isBlocked = await blockRepository.findBlock(input.requesterId, input.recipientId);
    if (isBlocked) {
      throw ApiError.forbidden('Cannot send connection request to this user.');
    }

    const [recipient, existing] = await Promise.all([
      userRepository.findAuthenticatedById(input.recipientId),
      connectionRepository.findBetweenUsers(
        input.universityId,
        input.requesterId,
        input.recipientId,
      ),
    ]);

    if (!recipient || recipient.universityId !== input.universityId) {
      throw ApiError.notFound('Recipient');
    }

    // 2. Check existing connection status
    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw ApiError.conflict('You are already connected with this member.');
      }

      // Mutual concurrent auto-accept: if recipient had previously sent a PENDING request to requester
      if (existing.status === 'PENDING' && existing.requesterId === input.recipientId) {
        const autoAccepted = await connectionRepository.updateStatus(existing.id, 'ACCEPTED');
        await auditLogRepository.record({
          universityId: input.universityId,
          actorId: input.requesterId,
          action: 'CONNECTION_ACCEPTED',
          targetType: 'connection',
          targetId: autoAccepted.id,
          ip: input.meta?.ip,
          userAgent: input.meta?.userAgent,
          requestId: input.meta?.requestId,
          metadata: { note: 'Mutual concurrent auto-accept' },
        });

        // Notify both parties
        const requester = await userRepository.findAuthenticatedById(input.requesterId);
        const recipientRolePrefix = recipient.role.name === 'ALUMNI' ? '/alumni' : '/student';
        const requesterRolePrefix = requester?.role.name === 'ALUMNI' ? '/alumni' : '/student';

        await Promise.all([
          notificationService.notifyUser({
            userId: input.recipientId,
            type: 'CONNECTION_ACCEPTED',
            title: 'Connection Accepted',
            body: `You are now mutually connected with ${requester?.name || 'a university member'}.`,
            link: `${recipientRolePrefix}/connections`,
          }),
          notificationService.notifyUser({
            userId: input.requesterId,
            type: 'CONNECTION_ACCEPTED',
            title: 'Connection Accepted',
            body: `You are now mutually connected with ${recipient.name}.`,
            link: `${requesterRolePrefix}/connections`,
          }),
        ]);

        return autoAccepted;
      }

      if (existing.status === 'PENDING') {
        throw ApiError.conflict('A connection request is already pending between these members.');
      }

      // Check 7-day cooldown on REJECTED / DECLINED
      if (existing.status === 'REJECTED' || existing.status === 'DECLINED') {
        const cooldownMs = 7 * 24 * 60 * 60 * 1000;
        const rejectTime = existing.rejectedAt?.getTime() ?? existing.updatedAt.getTime();
        const diffMs = Date.now() - rejectTime;
        if (diffMs < cooldownMs) {
          const daysRemaining = Math.ceil((cooldownMs - diffMs) / (24 * 60 * 60 * 1000));
          throw ApiError.conflict(
            `A 7-day cooldown is active. You may re-request connection in ${daysRemaining} day(s).`,
          );
        }
        // If cooldown has elapsed, remove stale rejected connection to allow new request
        await connectionRepository.remove(existing.id);
      } else if (existing.status === 'CANCELLED') {
        // Can re-request after cancelled
        await connectionRepository.remove(existing.id);
      }
    }

    const connection = await connectionRepository.create(input);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.requesterId,
      action: 'CONNECTION_REQUESTED',
      targetType: 'connection',
      targetId: connection.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    const requester = await userRepository.findAuthenticatedById(input.requesterId);
    const recipientRolePrefix = recipient.role.name === 'ALUMNI' ? '/alumni' : '/student';
    await notificationService.notifyUser({
      userId: input.recipientId,
      type: 'CONNECTION_REQUEST',
      title: 'New Connection Request',
      body: `${requester?.name || 'A campus member'} sent you a connection request.`,
      link: `${recipientRolePrefix}/connections?tab=received`,
    });

    return connection;
  },

  async respond(input: {
    connectionId: string;
    recipientId: string;
    universityId: string;
    status: 'ACCEPTED' | 'REJECTED' | 'DECLINED';
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection || connection.universityId !== input.universityId) {
      throw ApiError.notFound('Connection');
    }
    if (connection.recipientId !== input.recipientId) {
      throw ApiError.forbidden('Only the connection recipient can respond.');
    }
    if (connection.status !== 'PENDING') {
      throw ApiError.conflict('This connection request has already been handled.');
    }

    const updated = await connectionRepository.updateStatus(input.connectionId, input.status, {
      rejectedAt: input.status === 'REJECTED' || input.status === 'DECLINED' ? new Date() : null,
      respondedAt: new Date(),
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.recipientId,
      action: input.status === 'ACCEPTED' ? 'CONNECTION_ACCEPTED' : 'CONNECTION_DECLINED',
      targetType: 'connection',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    if (input.status === 'ACCEPTED') {
      const responder = await userRepository.findAuthenticatedById(input.recipientId);
      const requesterUser = await userRepository.findAuthenticatedById(connection.requesterId);
      const requesterRolePrefix = requesterUser?.role.name === 'ALUMNI' ? '/alumni' : '/student';

      await notificationService.notifyUser({
        userId: connection.requesterId,
        type: 'CONNECTION_ACCEPTED',
        title: 'Connection Accepted',
        body: `${responder?.name || 'Your connection'} accepted your request.`,
        link: `${requesterRolePrefix}/connections`,
      });
    }

    return updated;
  },

  async cancel(input: {
    connectionId: string;
    requesterId: string;
    universityId: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection || connection.universityId !== input.universityId) {
      throw ApiError.notFound('Connection');
    }
    if (connection.requesterId !== input.requesterId) {
      throw ApiError.forbidden('Only the sender can cancel a pending connection request.');
    }
    if (connection.status !== 'PENDING') {
      throw ApiError.conflict('Only pending requests can be cancelled.');
    }

    const updated = await connectionRepository.updateStatus(input.connectionId, 'CANCELLED');
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.requesterId,
      action: 'CONNECTION_CANCELLED',
      targetType: 'connection',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return updated;
  },

  async remove(input: {
    connectionId: string;
    userId: string;
    universityId: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection || connection.universityId !== input.universityId) {
      throw ApiError.notFound('Connection');
    }
    if (connection.requesterId !== input.userId && connection.recipientId !== input.userId) {
      throw ApiError.forbidden('You are not a participant in this connection.');
    }

    await connectionRepository.remove(input.connectionId);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.userId,
      action: 'CONNECTION_REMOVED',
      targetType: 'connection',
      targetId: input.connectionId,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return { success: true };
  },

  listWithTab(
    universityId: string,
    userId: string,
    tab: 'connected' | 'received' | 'sent',
    options: { q?: string; page?: number; limit?: number } = {},
  ) {
    return connectionRepository.listForUserWithTab(universityId, userId, tab, options);
  },

  list(universityId: string, userId: string) {
    return connectionRepository.listForUser(universityId, userId);
  },
};
