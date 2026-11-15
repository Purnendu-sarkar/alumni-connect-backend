import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { notificationService } from '../notification/notification.service.js';

export const connectionService = {
  async create(input: {
    universityId: string;
    requesterId: string;
    recipientId: string;
    message?: string;
  }) {
    if (input.requesterId === input.recipientId) {
      throw ApiError.badRequest('You cannot send a connection request to yourself.');
    }

    const [recipient, existing] = await Promise.all([
      userRepository.findAuthenticatedById(input.recipientId),
      connectionRepository.findBetweenUsers(
        input.universityId,
        input.requesterId,
        input.recipientId,
      ),
    ]);

    if (!recipient || recipient.universityId !== input.universityId)
      throw ApiError.notFound('Recipient');
    if (existing) throw ApiError.conflict('A connection already exists between these users.');

    const connection = await connectionRepository.create(input);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.requesterId,
      action: 'CONNECTION_REQUESTED',
      targetType: 'connection',
      targetId: connection.id,
    });

    const requester = await userRepository.findAuthenticatedById(input.requesterId);
    const recipientRolePrefix = recipient.role.name === 'ALUMNI' ? '/alumni' : '/student';
    await notificationService.notifyUser({
      userId: input.recipientId,
      type: 'CONNECTION_REQUEST',
      title: 'New Connection Request',
      body: `${requester?.name || 'A campus member'} sent you a connection request.`,
      link: `${recipientRolePrefix}/connections`,
    });

    return connection;
  },

  async respond(input: {
    connectionId: string;
    recipientId: string;
    universityId: string;
    status: 'ACCEPTED' | 'DECLINED';
  }) {
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection || connection.universityId !== input.universityId)
      throw ApiError.notFound('Connection');
    if (connection.recipientId !== input.recipientId) {
      throw ApiError.forbidden('Only the connection recipient can respond.');
    }
    if (connection.status !== 'PENDING')
      throw ApiError.conflict('This connection request has already been handled.');

    const updated = await connectionRepository.updateStatus(input.connectionId, input.status);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.recipientId,
      action: input.status === 'ACCEPTED' ? 'CONNECTION_ACCEPTED' : 'CONNECTION_DECLINED',
      targetType: 'connection',
      targetId: updated.id,
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

  list(universityId: string, userId: string) {
    return connectionRepository.listForUser(universityId, userId);
  },
};
