import { ApiError } from '../../errors/api-error.js';
import { prisma } from '../../config/database.js';
import type { ConversationContext, MessageType, Prisma } from '../../generated/prisma/client.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { conversationRepository } from '../../repositories/conversation.repository.js';
import { messageRepository } from '../../repositories/message.repository.js';
import { privacyRepository } from '../../repositories/privacy.repository.js';
import { restrictionRepository } from '../../repositories/restriction.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { mediaService } from '../media/media.service.js';
import { getSocketServer } from '../../realtime/socket.server.js';
import type {
  ConversationPreferencesInput,
  CreateConversationInput,
  ListConversationsQueryInput,
  ListMessagesQueryInput,
  SendMessageInput,
} from '../../validators/message.validator.js';

export interface MessagingEligibility {
  eligible: boolean;
  reason?: 'SELF' | 'BLOCKED' | 'CONNECTIONS_ONLY' | 'DISALLOWED' | 'USER_NOT_FOUND' | 'INACTIVE';
  message?: string;
}

export const messageService = {
  async checkMessagingEligibility(
    viewerId: string,
    targetUserId: string,
    universityId: string,
  ): Promise<MessagingEligibility> {
    if (viewerId === targetUserId) {
      return { eligible: false, reason: 'SELF', message: 'You cannot message yourself.' };
    }

    const activeRestriction = await restrictionRepository.findActiveRestriction(viewerId, 'MESSAGING');
    if (activeRestriction) {
      return {
        eligible: false,
        reason: 'DISALLOWED',
        message: `Your messaging privileges are temporarily restricted until ${activeRestriction.endsAt.toISOString()}`,
      };
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        universityId: true,
        isActive: true,
        verificationStatus: true,
        role: { select: { name: true } },
      },
    });

    if (!targetUser || targetUser.universityId !== universityId) {
      return { eligible: false, reason: 'USER_NOT_FOUND', message: 'User does not exist in your university.' };
    }

    if (!targetUser.isActive || targetUser.verificationStatus !== 'APPROVED') {
      return { eligible: false, reason: 'INACTIVE', message: 'This member account is inactive or pending accreditation.' };
    }

    // 1. Check bidirectional block
    const block = await blockRepository.findBlock(viewerId, targetUserId);
    if (block) {
      return {
        eligible: false,
        reason: 'BLOCKED',
        message: 'Direct messaging is unavailable because one of you has blocked the other.',
      };
    }

    // 2. Check target's messaging privacy permission
    const privacy = await privacyRepository.getOrCreateDefault(targetUserId);
    const messagingPermission = privacy.messagingPermission ?? 'ALL_MEMBERS';

    if (messagingPermission === 'ONLY_ME') {
      return {
        eligible: false,
        reason: 'DISALLOWED',
        message: 'This user does not accept direct messages.',
      };
    }

    if (messagingPermission === 'CONNECTIONS_ONLY') {
      const conn = await connectionRepository.findBetweenUsers(universityId, viewerId, targetUserId);
      if (!conn || conn.status !== 'ACCEPTED') {
        return {
          eligible: false,
          reason: 'CONNECTIONS_ONLY',
          message: 'This user only accepts direct messages from accepted connections.',
        };
      }
    }

    return { eligible: true };
  },

  async startOrGetConversation(
    universityId: string,
    creatorId: string,
    input: CreateConversationInput,
  ) {
    const activeRestriction = await restrictionRepository.findActiveRestriction(creatorId, 'MESSAGING');
    if (activeRestriction) {
      throw new ApiError(
        403,
        `Your messaging privileges are temporarily restricted until ${activeRestriction.endsAt.toISOString()}`,
        'USER_RESTRICTED',
      );
    }

    const { targetUserId, initialMessage, contextType, contextId } = input;

    const eligibility = await this.checkMessagingEligibility(creatorId, targetUserId, universityId);
    if (!eligibility.eligible) {
      throw ApiError.forbidden(eligibility.message || 'Messaging not permitted.');
    }

    const conversation = await conversationRepository.findOrCreateConversation(
      universityId,
      creatorId,
      targetUserId,
      contextType as ConversationContext,
      contextId,
    );

    if (initialMessage && initialMessage.trim().length > 0) {
      await this.sendMessage(conversation.id, creatorId, universityId, {
        content: initialMessage.trim(),
        type: 'TEXT',
      });
    }

    return conversationRepository.findById(conversation.id, creatorId);
  },

  async getConversations(
    universityId: string,
    userId: string,
    query: ListConversationsQueryInput,
  ) {
    return conversationRepository.findUserConversations(universityId, userId, query);
  },

  async getConversationById(conversationId: string, userId: string) {
    const conversation = await conversationRepository.findById(conversationId, userId);
    if (!conversation) {
      throw ApiError.notFound('Conversation not found.');
    }

    const isMember = conversation.participants.some((p) => p.userId === userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    return conversation;
  },

  async getMessages(
    conversationId: string,
    userId: string,
    query: ListMessagesQueryInput,
  ) {
    const isMember = await conversationRepository.isParticipant(conversationId, userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    return messageRepository.findMessagesByConversation(conversationId, userId, query);
  },

  async sendMessage(
    conversationId: string,
    senderId: string,
    universityId: string,
    input: SendMessageInput,
  ) {
    const activeRestriction = await restrictionRepository.findActiveRestriction(senderId, 'MESSAGING');
    if (activeRestriction) {
      throw new ApiError(
        403,
        `Your messaging privileges are temporarily restricted until ${activeRestriction.endsAt.toISOString()}`,
        'USER_RESTRICTED',
      );
    }

    const conversation = await conversationRepository.findById(conversationId, senderId);
    if (!conversation) {
      throw ApiError.notFound('Conversation not found.');
    }

    const isMember = conversation.participants.some((p) => p.userId === senderId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    const recipientParticipant = conversation.participants.find((p) => p.userId !== senderId);
    if (!recipientParticipant) {
      throw ApiError.badRequest('Cannot send message without a valid recipient in the conversation.');
    }
    const recipientId = recipientParticipant.userId;

    // Check block & privacy eligibility before dispatching
    const eligibility = await this.checkMessagingEligibility(senderId, recipientId, universityId);
    if (!eligibility.eligible) {
      throw ApiError.forbidden(eligibility.message || 'Cannot send message to this recipient.');
    }

    const message = await messageRepository.createMessage({
      conversationId,
      senderId,
      type: input.type as MessageType,
      content: input.content,
      attachments: input.attachments as Prisma.InputJsonValue | undefined,
      replyToId: input.replyToId,
    });

    const snippet = input.type === 'TEXT'
      ? input.content
      : `[${input.type.toLowerCase()}] ${input.content || 'Attachment'}`;

    await Promise.all([
      conversationRepository.updateLastMessage(conversationId, message.id, snippet, message.createdAt),
      conversationRepository.incrementUnread(conversationId, recipientId),
    ]);

    // Emit Socket.io real-time events to both participants
    const io = getSocketServer();
    if (io) {
      io.to(`user:${recipientId}`).emit('message:new', {
        conversationId,
        message,
      });
      io.to(`user:${senderId}`).emit('message:new', {
        conversationId,
        message,
      });
      io.to(`user:${recipientId}`).emit('conversation:updated', {
        conversationId,
        lastMessageSnippet: snippet,
        lastMessageAt: message.createdAt,
      });
      io.to(`user:${senderId}`).emit('conversation:updated', {
        conversationId,
        lastMessageSnippet: snippet,
        lastMessageAt: message.createdAt,
      });
    }

    return message;
  },

  async editMessage(messageId: string, userId: string, newContent: string) {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw ApiError.notFound('Message not found.');
    }

    if (message.senderId !== userId) {
      throw ApiError.forbidden('You can only edit your own messages.');
    }

    if (message.isDeletedForAll) {
      throw ApiError.badRequest('Deleted messages cannot be edited.');
    }

    const elapsedMs = Date.now() - new Date(message.createdAt).getTime();
    const fifteenMinutesMs = 15 * 60 * 1000;
    if (elapsedMs > fifteenMinutesMs) {
      throw ApiError.badRequest('Messages can only be edited within 15 minutes of sending.');
    }

    const updated = await messageRepository.updateContent(messageId, newContent);

    const io = getSocketServer();
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('message:updated', {
        conversationId: message.conversationId,
        message: updated,
      });
    }

    return updated;
  },

  async deleteMessage(messageId: string, userId: string, mode: 'ME' | 'EVERYONE') {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw ApiError.notFound('Message not found.');
    }

    const isMember = await conversationRepository.isParticipant(message.conversationId, userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    if (mode === 'ME') {
      await messageRepository.addDeletedForUser(messageId, userId);
      const io = getSocketServer();
      if (io) {
        io.to(`user:${userId}`).emit('message:deleted_for_me', {
          conversationId: message.conversationId,
          messageId,
        });
      }
      return { success: true, mode: 'ME' };
    }

    // Mode EVERYONE requires author
    if (message.senderId !== userId) {
      throw ApiError.forbidden('You can only delete your own messages for everyone.');
    }

    const updated = await messageRepository.markDeletedForAll(messageId);

    // Clean up any Cloudinary attachments asynchronously
    if (message.attachments && Array.isArray(message.attachments)) {
      for (const att of message.attachments as Array<{ publicId?: string; mimeType?: string }>) {
        if (att.publicId) {
          const isVideo = att.mimeType?.startsWith('video/') || att.mimeType?.startsWith('audio/');
          const isRaw =
            att.mimeType?.startsWith('application/') ||
            att.mimeType?.includes('pdf') ||
            att.mimeType?.includes('document') ||
            att.mimeType?.includes('spreadsheet');
          const resType = isVideo ? 'video' : isRaw ? 'raw' : 'image';
          void mediaService.deleteCloudinaryAsset(att.publicId, resType);
        }
      }
    }

    const io = getSocketServer();
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('message:deleted_for_all', {
        conversationId: message.conversationId,
        messageId,
      });
    }

    return { success: true, mode: 'EVERYONE', message: updated };
  },

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw ApiError.notFound('Message not found.');
    }

    const isMember = await conversationRepository.isParticipant(message.conversationId, userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    const updated = await messageRepository.toggleReaction(messageId, userId, emoji);

    const io = getSocketServer();
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('message:reaction_updated', {
        conversationId: message.conversationId,
        messageId,
        reactions: updated?.reactions,
      });
    }

    return updated;
  },

  async markConversationRead(conversationId: string, userId: string) {
    const conversation = await conversationRepository.findById(conversationId, userId);
    if (!conversation) {
      throw ApiError.notFound('Conversation not found.');
    }

    const isMember = conversation.participants.some((p) => p.userId === userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    await Promise.all([
      messageRepository.markAllRead(conversationId, userId),
      conversationRepository.resetUnread(conversationId, userId),
    ]);

    const otherParticipant = conversation.participants.find((p) => p.userId !== userId);
    if (otherParticipant) {
      const io = getSocketServer();
      if (io) {
        io.to(`user:${otherParticipant.userId}`).emit('message:read', {
          conversationId,
          readerId: userId,
          readAt: new Date(),
        });
      }
    }

    return { success: true };
  },

  async updateConversationPreferences(
    conversationId: string,
    userId: string,
    preferences: ConversationPreferencesInput,
  ) {
    const isMember = await conversationRepository.isParticipant(conversationId, userId);
    if (!isMember) {
      throw ApiError.forbidden('You are not a participant in this conversation.');
    }

    return conversationRepository.updateParticipantPreferences(conversationId, userId, preferences);
  },

  async getTotalUnreadCount(userId: string) {
    const count = await conversationRepository.getTotalUnreadCount(userId);
    return { unreadCount: count };
  },
};
