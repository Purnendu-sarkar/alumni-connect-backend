import { prisma } from '../config/database.js';
import {
  Prisma,
  type Message,
  type MessageDeliveryStatus,
  type MessageType,
} from '../generated/prisma/client.js';

export interface CreateMessageData {
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string;
  attachments?: Prisma.InputJsonValue;
  replyToId?: string;
}

export const messageRepository = {
  async createMessage(data: CreateMessageData): Promise<Message> {
    return prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        type: data.type,
        content: data.content,
        attachments: data.attachments ?? undefined,
        replyToId: data.replyToId,
        deliveryStatus: 'SENT',
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: { select: { name: true } },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  },

  async findById(messageId: string) {
    return prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: { select: { name: true } },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  },

  async findMessagesByConversation(
    conversationId: string,
    userId: string,
    params: { cursor?: string; limit?: number },
  ) {
    const limit = Math.min(params.limit ?? 30, 100);

    const where: Prisma.MessageWhereInput = {
      conversationId,
      NOT: {
        deletedForUserIds: {
          has: userId,
        },
      },
    };

    let messages: Message[];

    if (params.cursor) {
      messages = await prisma.message.findMany({
        where,
        take: limit + 1,
        cursor: { id: params.cursor },
        skip: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              role: { select: { name: true } },
            },
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    } else {
      messages = await prisma.message.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              role: { select: { name: true } },
            },
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
    }

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      const nextItem = messages.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    // Return in chronological order (oldest to newest) for client thread rendering
    messages.reverse();

    return {
      messages,
      nextCursor,
    };
  },

  async updateContent(messageId: string, newContent: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: {
        content: newContent,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: { select: { name: true } },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  },

  async markDeliveredForRecipient(conversationId: string, recipientId: string) {
    return prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: recipientId },
        deliveryStatus: 'SENT',
      },
      data: {
        deliveryStatus: 'DELIVERED',
      },
    });
  },

  async markAllRead(conversationId: string, readerId: string) {
    const now = new Date();
    return prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: readerId },
        deliveryStatus: { in: ['SENT', 'DELIVERED'] },
      },
      data: {
        deliveryStatus: 'READ',
        readAt: now,
      },
    });
  },

  async addDeletedForUser(messageId: string, userId: string) {
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { deletedForUserIds: true },
    });
    if (!existing) return null;

    const currentList = existing.deletedForUserIds || [];
    if (currentList.includes(userId)) {
      return existing;
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        deletedForUserIds: { push: userId },
      },
    });
  },

  async markDeletedForAll(messageId: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: {
        isDeletedForAll: true,
        deletedForAllAt: new Date(),
        content: 'This message was deleted',
        attachments: Prisma.DbNull,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },

  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      select: { reactions: true },
    });
    if (!msg) return null;

    const currentReactions = (msg.reactions as Record<string, string[]>) || {};
    const usersForEmoji = new Set(currentReactions[emoji] || []);

    if (usersForEmoji.has(userId)) {
      usersForEmoji.delete(userId);
    } else {
      usersForEmoji.add(userId);
    }

    const updatedReactions: Record<string, string[]> = { ...currentReactions };
    if (usersForEmoji.size === 0) {
      delete updatedReactions[emoji];
    } else {
      updatedReactions[emoji] = Array.from(usersForEmoji);
    }

    return prisma.message.update({
      where: { id: messageId },
      data: {
        reactions: updatedReactions,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: { select: { name: true } },
          },
        },
      },
    });
  },
};
