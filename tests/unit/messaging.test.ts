import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageService } from '../../src/services/message/message.service.js';
import { conversationRepository, normalizeParticipantPair } from '../../src/repositories/conversation.repository.js';
import { messageRepository } from '../../src/repositories/message.repository.js';
import { blockRepository } from '../../src/repositories/block.repository.js';
import { connectionRepository } from '../../src/repositories/connection.repository.js';
import { privacyRepository } from '../../src/repositories/privacy.repository.js';
import { mediaService } from '../../src/services/media/media.service.js';
import { prisma } from '../../src/config/database.js';

describe('Feature 11: Real-Time 1:1 Messaging System Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Participant Pair Normalization', () => {
    it('always places the lexicographically smaller ID as userLowId and larger as userHighId', () => {
      const pair1 = normalizeParticipantPair('user-alpha', 'user-beta');
      expect(pair1.userLowId).toBe('user-alpha');
      expect(pair1.userHighId).toBe('user-beta');

      const pair2 = normalizeParticipantPair('user-beta', 'user-alpha');
      expect(pair2.userLowId).toBe('user-alpha');
      expect(pair2.userHighId).toBe('user-beta');
    });
  });

  describe('Messaging Eligibility Verification', () => {
    const uniId = 'uni-nwu';
    const viewerId = 'user-viewer';
    const targetId = 'user-target';

    it('rejects messaging oneself with SELF reason', async () => {
      const result = await messageService.checkMessagingEligibility(viewerId, viewerId, uniId);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('SELF');
    });

    it('rejects when target user does not exist or is inactive', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('USER_NOT_FOUND');
    });

    it('rejects when a bidirectional block exists between parties', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: targetId,
        universityId: uniId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'ALUMNI' },
      } as any);

      vi.spyOn(blockRepository, 'findBlock').mockResolvedValueOnce({
        id: 'block-1',
        blockerId: targetId,
        blockedId: viewerId,
        reason: 'Harassment',
        createdAt: new Date(),
      } as any);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('BLOCKED');
    });

    it('rejects when target has ONLY_ME messaging permission', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: targetId,
        universityId: uniId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'ALUMNI' },
      } as any);
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValueOnce(null);
      vi.spyOn(privacyRepository, 'getOrCreateDefault').mockResolvedValueOnce({
        id: 'priv-1',
        userId: targetId,
        messagingPermission: 'ONLY_ME',
      } as any);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('DISALLOWED');
    });

    it('rejects when target has CONNECTIONS_ONLY and no accepted connection exists', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: targetId,
        universityId: uniId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'ALUMNI' },
      } as any);
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValueOnce(null);
      vi.spyOn(privacyRepository, 'getOrCreateDefault').mockResolvedValueOnce({
        id: 'priv-1',
        userId: targetId,
        messagingPermission: 'CONNECTIONS_ONLY',
      } as any);
      vi.spyOn(connectionRepository, 'findBetweenUsers').mockResolvedValueOnce(null);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('CONNECTIONS_ONLY');
    });

    it('allows messaging when target has CONNECTIONS_ONLY and connection is ACCEPTED', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: targetId,
        universityId: uniId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'ALUMNI' },
      } as any);
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValueOnce(null);
      vi.spyOn(privacyRepository, 'getOrCreateDefault').mockResolvedValueOnce({
        id: 'priv-1',
        userId: targetId,
        messagingPermission: 'CONNECTIONS_ONLY',
      } as any);
      vi.spyOn(connectionRepository, 'findBetweenUsers').mockResolvedValueOnce({
        id: 'conn-1',
        status: 'ACCEPTED',
      } as any);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(true);
    });

    it('allows messaging when target has ALL_MEMBERS messaging permission', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
        id: targetId,
        universityId: uniId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'STUDENT' },
      } as any);
      vi.spyOn(blockRepository, 'findBlock').mockResolvedValueOnce(null);
      vi.spyOn(privacyRepository, 'getOrCreateDefault').mockResolvedValueOnce({
        id: 'priv-1',
        userId: targetId,
        messagingPermission: 'ALL_MEMBERS',
      } as any);

      const result = await messageService.checkMessagingEligibility(viewerId, targetId, uniId);
      expect(result.eligible).toBe(true);
    });
  });

  describe('Message Edit Rules (15-Minute Policy)', () => {
    it('allows editing a message sent within the 15-minute window', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
        content: 'Original message text',
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        isDeletedForAll: false,
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);
      vi.spyOn(messageRepository, 'updateContent').mockResolvedValueOnce({
        ...mockMessage,
        content: 'Edited message text',
        isEdited: true,
      } as any);

      const result = await messageService.editMessage('msg-1', 'user-author', 'Edited message text');
      expect(result.content).toBe('Edited message text');
      expect(result.isEdited).toBe(true);
    });

    it('rejects editing a message after 15 minutes have elapsed', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
        content: 'Old text',
        createdAt: new Date(Date.now() - 16 * 60 * 1000), // 16 minutes ago
        isDeletedForAll: false,
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);

      await expect(
        messageService.editMessage('msg-1', 'user-author', 'New text'),
      ).rejects.toThrow('Messages can only be edited within 15 minutes of sending.');
    });

    it('rejects editing another member’s message', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
        content: 'Original text',
        createdAt: new Date(Date.now() - 2 * 60 * 1000),
        isDeletedForAll: false,
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);

      await expect(
        messageService.editMessage('msg-1', 'user-stranger', 'Hijacked text'),
      ).rejects.toThrow('You can only edit your own messages.');
    });
  });

  describe('Message Deletion Rules', () => {
    it('allows Delete for Me by adding user ID to deletedForUserIds array', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);
      vi.spyOn(conversationRepository, 'isParticipant').mockResolvedValueOnce(true);
      const deleteForMeSpy = vi.spyOn(messageRepository, 'addDeletedForUser').mockResolvedValueOnce({} as any);

      const result = await messageService.deleteMessage('msg-1', 'user-reader', 'ME');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('ME');
      expect(deleteForMeSpy).toHaveBeenCalledWith('msg-1', 'user-reader');
    });

    it('rejects Delete for Everyone if requesting user is not the author', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);
      vi.spyOn(conversationRepository, 'isParticipant').mockResolvedValueOnce(true);

      await expect(
        messageService.deleteMessage('msg-1', 'user-reader', 'EVERYONE'),
      ).rejects.toThrow('You can only delete your own messages for everyone.');
    });

    it('allows Delete for Everyone when executed by the message author', async () => {
      const mockMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
        attachments: [],
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);
      vi.spyOn(conversationRepository, 'isParticipant').mockResolvedValueOnce(true);
      const deleteForAllSpy = vi.spyOn(messageRepository, 'markDeletedForAll').mockResolvedValueOnce({
        ...mockMessage,
        isDeletedForAll: true,
      } as any);

      const result = await messageService.deleteMessage('msg-1', 'user-author', 'EVERYONE');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('EVERYONE');
      expect(deleteForAllSpy).toHaveBeenCalledWith('msg-1');
    });

    it('deletes Cloudinary attachment with resource_type raw when deleting a PDF for everyone', async () => {
      const mockMessage = {
        id: 'msg-pdf-1',
        conversationId: 'conv-1',
        senderId: 'user-author',
        attachments: [
          {
            publicId: 'alumni-connect/messages/user-author/sample-doc',
            fileName: 'syllabus.pdf',
            mimeType: 'application/pdf',
          },
        ],
      };

      vi.spyOn(messageRepository, 'findById').mockResolvedValueOnce(mockMessage as any);
      vi.spyOn(conversationRepository, 'isParticipant').mockResolvedValueOnce(true);
      vi.spyOn(messageRepository, 'markDeletedForAll').mockResolvedValueOnce({
        ...mockMessage,
        isDeletedForAll: true,
      } as any);
      const deleteAssetSpy = vi.spyOn(mediaService, 'deleteCloudinaryAsset').mockResolvedValueOnce(undefined as any);

      const result = await messageService.deleteMessage('msg-pdf-1', 'user-author', 'EVERYONE');
      expect(result.success).toBe(true);
      expect(deleteAssetSpy).toHaveBeenCalledWith(
        'alumni-connect/messages/user-author/sample-doc',
        'raw',
      );
    });
  });
});
