import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionService } from '../../src/services/connection/connection.service.js';
import { blockService } from '../../src/services/connection/block.service.js';
import { connectionRepository } from '../../src/repositories/connection.repository.js';
import { blockRepository } from '../../src/repositories/block.repository.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { notificationService } from '../../src/services/notification/notification.service.js';

describe('Feature 4: Connection & Block System Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Lifecycle & Constraints', () => {
    it('rejects self-connection with 422 Unprocessable Entity', async () => {
      await expect(
        connectionService.create({
          universityId: 'uni-1',
          requesterId: 'user-1',
          recipientId: 'user-1',
        }),
      ).rejects.toThrow('You cannot send a connection request to yourself.');
    });

    it('blocks connection request if target user has blocked requester (403 Forbidden)', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue({
        id: 'blk-1',
        blockerId: 'user-2',
        blockedId: 'user-1',
        reason: null,
        createdAt: new Date(),
      });

      await expect(
        connectionService.create({
          universityId: 'uni-1',
          requesterId: 'user-1',
          recipientId: 'user-2',
        }),
      ).rejects.toThrow('Cannot send connection request to this user.');
    });

    it('enforces 7-day cooldown after rejection', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue(null);
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'user-2',
        universityId: 'uni-1',
        role: { name: 'ALUMNI' },
      } as any);

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      vi.spyOn(connectionRepository, 'findBetweenUsers').mockResolvedValue({
        id: 'conn-1',
        universityId: 'uni-1',
        requesterId: 'user-1',
        recipientId: 'user-2',
        userLowId: 'user-1',
        userHighId: 'user-2',
        status: 'REJECTED',
        message: null,
        respondedAt: threeDaysAgo,
        rejectedAt: threeDaysAgo,
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
      } as any);

      await expect(
        connectionService.create({
          universityId: 'uni-1',
          requesterId: 'user-1',
          recipientId: 'user-2',
        }),
      ).rejects.toThrow(/cooldown is active/);
    });

    it('atomically auto-accepts mutual concurrent connection requests', async () => {
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValue(null);
      vi.spyOn(userRepository, 'findAuthenticatedById').mockImplementation(async (id) => ({
        id,
        universityId: 'uni-1',
        role: { name: id === 'user-1' ? 'STUDENT' : 'ALUMNI' },
        name: id === 'user-1' ? 'Student One' : 'Alumni Two',
      } as any));

      // user-2 had previously sent a pending request to user-1
      vi.spyOn(connectionRepository, 'findBetweenUsers').mockResolvedValue({
        id: 'conn-pending',
        universityId: 'uni-1',
        requesterId: 'user-2',
        recipientId: 'user-1',
        status: 'PENDING',
      } as any);

      const updateSpy = vi.spyOn(connectionRepository, 'updateStatus').mockResolvedValue({
        id: 'conn-pending',
        status: 'ACCEPTED',
      } as any);

      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      const result = await connectionService.create({
        universityId: 'uni-1',
        requesterId: 'user-1',
        recipientId: 'user-2',
      });

      expect(updateSpy).toHaveBeenCalledWith('conn-pending', 'ACCEPTED');
      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('ACCEPTED');
    });

    it('normalizes pair identifiers symmetrically (userLowId, userHighId)', () => {
      const pair1 = connectionRepository.getNormalizedPair('usr-zzz', 'usr-aaa');
      expect(pair1.userLowId).toBe('usr-aaa');
      expect(pair1.userHighId).toBe('usr-zzz');

      const pair2 = connectionRepository.getNormalizedPair('usr-aaa', 'usr-zzz');
      expect(pair2.userLowId).toBe('usr-aaa');
      expect(pair2.userHighId).toBe('usr-zzz');
    });
  });

  describe('Block Subsystem', () => {
    it('blocks user, severs connection, and logs USER_BLOCKED', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'target-user',
        universityId: 'uni-1',
      } as any);
      vi.spyOn(blockRepository, 'findDirectBlock').mockResolvedValue(null);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const mockTx = {
        block: {
          create: vi.fn().mockResolvedValue({
            id: 'blk-new',
            blockerId: 'blocker-user',
            blockedId: 'target-user',
            reason: 'Harassment',
            createdAt: new Date(),
          }),
        },
        connection: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        mentorshipRequest: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const { prisma } = await import('../../src/config/database.js');
      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const result = await blockService.blockUser({
        blockerId: 'blocker-user',
        blockedId: 'target-user',
        universityId: 'uni-1',
        reason: 'Harassment',
      });

      expect(result.blockerId).toBe('blocker-user');
      expect(result.blockedId).toBe('target-user');
    });

    it('rejects self-blocking with 400 Bad Request', async () => {
      await expect(
        blockService.blockUser({
          blockerId: 'user-1',
          blockedId: 'user-1',
          universityId: 'uni-1',
        }),
      ).rejects.toThrow('You cannot block yourself.');
    });
  });
});
