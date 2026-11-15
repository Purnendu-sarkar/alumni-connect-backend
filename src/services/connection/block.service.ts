import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { cacheService } from '../cache/cache.service.js';

export const blockService = {
  async blockUser(input: {
    blockerId: string;
    blockedId: string;
    universityId: string;
    reason?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    if (input.blockerId === input.blockedId) {
      throw ApiError.badRequest('You cannot block yourself.');
    }

    const targetUser = await userRepository.findAuthenticatedById(input.blockedId);
    if (!targetUser || targetUser.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    const existingBlock = await blockRepository.findDirectBlock(input.blockerId, input.blockedId);
    if (existingBlock) {
      return existingBlock;
    }

    return prisma.$transaction(async (tx) => {
      // 1. Create block
      const block = await tx.block.create({
        data: {
          blockerId: input.blockerId,
          blockedId: input.blockedId,
          reason: input.reason?.trim() || null,
        },
      });

      // 2. Sever any existing Connection
      const { userLowId, userHighId } = connectionRepository.getNormalizedPair(
        input.blockerId,
        input.blockedId,
      );
      await tx.connection.deleteMany({
        where: {
          OR: [
            { userLowId, userHighId },
            { requesterId: input.blockerId, recipientId: input.blockedId },
            { requesterId: input.blockedId, recipientId: input.blockerId },
          ],
        },
      });

      // 3. Cancel any pending or active MentorshipRequest between them
      await tx.mentorshipRequest.updateMany({
        where: {
          OR: [
            { mentorId: input.blockerId, menteeId: input.blockedId },
            { mentorId: input.blockedId, menteeId: input.blockerId },
          ],
          status: { in: ['REQUESTED', 'CLARIFICATION_REQUESTED', 'ACTIVE', 'PENDING', 'ACCEPTED'] },
        },
        data: {
          status: 'CANCELLED',
          endedAt: new Date(),
          endedById: input.blockerId,
          endNote: 'Relationship severed due to user block action.',
        },
      });

      // 4. Invalidate viewer-neutral directory cache
      await cacheService.bumpVersion('dir');

      // 5. Audit log
      await auditLogRepository.record({
        universityId: input.universityId,
        actorId: input.blockerId,
        action: 'USER_BLOCKED',
        targetType: 'user',
        targetId: input.blockedId,
        ip: input.meta?.ip,
        userAgent: input.meta?.userAgent,
        requestId: input.meta?.requestId,
        metadata: { reason: input.reason },
      });

      return block;
    });
  },

  async unblockUser(input: {
    blockerId: string;
    blockedId: string;
    universityId: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const existing = await blockRepository.findDirectBlock(input.blockerId, input.blockedId);
    if (!existing) {
      throw ApiError.notFound('Block record not found.');
    }

    await blockRepository.delete(input.blockerId, input.blockedId);
    await cacheService.bumpVersion('dir');

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.blockerId,
      action: 'USER_UNBLOCKED',
      targetType: 'user',
      targetId: input.blockedId,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return { success: true };
  },

  async listBlocked(userId: string) {
    const records = await blockRepository.listBlockedByUser(userId);
    return records.map((r) => ({
      id: r.id,
      blockedId: r.blockedId,
      name: r.blocked.name,
      avatarUrl: r.blocked.avatarUrl,
      department: r.blocked.department,
      currentCompany: r.blocked.currentCompany,
      position: r.blocked.position,
      role: r.blocked.role.name,
      reason: r.reason,
      createdAt: r.createdAt,
    }));
  },
};
