import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { userRepository } from '../../repositories/user.repository.js';

export const adminService = {
  async verifyUser(input: { userId: string; universityId: string; actorId: string }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) throw ApiError.notFound('User');

    const user = await userRepository.verifyForUniversity(input.userId, input.universityId);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'user.verified',
      targetType: 'user',
      targetId: input.userId,
    });
    return user;
  },
};
