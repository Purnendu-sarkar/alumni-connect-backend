import { ConnectionStatus } from '@prisma/client';

import { ApiError } from '../../errors/api-error.js';
import { connectionModel } from '../../models/connection.model.js';
import { userModel } from '../../models/user.model.js';
import { auditLogModel } from '../../models/audit-log.model.js';

export const connectionService = {
  async createRequest(input: {
    requesterId: string;
    receiverId: string;
    note?: string;
  }) {
    if (input.requesterId === input.receiverId) {
      throw ApiError.badRequest('You cannot send a connection request to yourself.');
    }

    const receiver = await userModel.findById(input.receiverId);
    if (!receiver) {
      throw ApiError.notFound('Target member');
    }

    const existing = await connectionModel.findPair(input.requesterId, input.receiverId);
    if (existing) {
      if (existing.status === ConnectionStatus.ACCEPTED) {
        throw ApiError.conflict('You are already connected with this member.');
      }
      if (existing.status === ConnectionStatus.PENDING) {
        throw ApiError.conflict('A connection request is already pending between you.');
      }
    }

    const connection = await connectionModel.createRequest(input);

    await auditLogModel.record({
      actorId: input.requesterId,
      action: 'CONNECTION_REQUEST',
      targetType: 'Connection',
      targetId: connection.id,
      metadata: { reason: 'Member requested connection' },
    });

    return connection;
  },

  async respond(input: {
    connectionId: string;
    userId: string;
    action: 'ACCEPT' | 'REJECT';
  }) {
    const connection = await connectionModel.findPair(input.userId, input.userId); // or by id
    // We can also query directly by id
    const targetConn = await (await import('../../config/database.js')).prisma.connection.findUnique({
      where: { id: input.connectionId },
    });

    if (!targetConn) {
      throw ApiError.notFound('Connection request');
    }

    if (targetConn.receiverId !== input.userId) {
      throw ApiError.forbidden('Only the recipient of a connection request can respond.');
    }

    if (targetConn.status !== ConnectionStatus.PENDING) {
      throw ApiError.conflict('This connection request has already been processed.');
    }

    const nextStatus = input.action === 'ACCEPT' ? ConnectionStatus.ACCEPTED : ConnectionStatus.REJECTED;
    const updated = await connectionModel.updateStatus(input.connectionId, nextStatus, {
      respondedAt: new Date(),
      rejectedAt: input.action === 'REJECT' ? new Date() : undefined,
    });

    await auditLogModel.record({
      actorId: input.userId,
      action: input.action === 'ACCEPT' ? 'CONNECTION_ACCEPT' : 'CONNECTION_REJECT',
      targetType: 'Connection',
      targetId: updated.id,
    });

    return updated;
  },

  listUserConnections(userId: string, options: { status?: ConnectionStatus; skip?: number; take?: number }) {
    return connectionModel.listUserConnections(userId, options);
  },
};
