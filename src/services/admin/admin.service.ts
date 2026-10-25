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
};
