import { prisma } from '../config/database.js';
import {
  Prisma,
  type Conversation,
  type ConversationContext,
  type ConversationParticipant,
} from '../generated/prisma/client.js';

export function normalizeParticipantPair(idA: string, idB: string): { userLowId: string; userHighId: string } {
  return idA < idB ? { userLowId: idA, userHighId: idB } : { userLowId: idB, userHighId: idA };
}

export const conversationRepository = {
  normalizeParticipantPair,

  async findConversationByPair(
    universityId: string,
    userA: string,
    userB: string,
  ): Promise<Conversation | null> {
    const { userLowId, userHighId } = normalizeParticipantPair(userA, userB);
    return prisma.conversation.findUnique({
      where: {
        universityId_userLowId_userHighId: {
          universityId,
          userLowId,
          userHighId,
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                role: { select: { name: true } },
                department: true,
                position: true,
                currentCompany: true,
              },
            },
          },
        },
      },
    });
  },

  async findById(conversationId: string, userId?: string) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                role: { select: { name: true } },
                department: true,
                position: true,
                currentCompany: true,
              },
            },
          },
        },
        lastMessage: {
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

  async findOrCreateConversation(
    universityId: string,
    creatorId: string,
    targetUserId: string,
    contextType: ConversationContext = 'DIRECT',
    contextId?: string,
  ) {
    const { userLowId, userHighId } = normalizeParticipantPair(creatorId, targetUserId);

    const existing = await prisma.conversation.findUnique({
      where: {
        universityId_userLowId_userHighId: {
          universityId,
          userLowId,
          userHighId,
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
                role: { select: { name: true } },
                department: true,
                position: true,
                currentCompany: true,
              },
            },
          },
        },
        lastMessage: true,
      },
    });

    if (existing) {
      return existing;
    }

    try {
      return await prisma.conversation.create({
        data: {
          universityId,
          userLowId,
          userHighId,
          contextType,
          contextId,
          createdById: creatorId,
          participants: {
            create: [
              { userId: creatorId },
              { userId: targetUserId },
            ],
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  role: { select: { name: true } },
                  department: true,
                  position: true,
                  currentCompany: true,
                },
              },
            },
          },
          lastMessage: true,
        },
      });
    } catch (err: unknown) {
      // Concurrency race condition: If another concurrent request created the conversation, query and return it
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raceExisting = await prisma.conversation.findUnique({
          where: {
            universityId_userLowId_userHighId: {
              universityId,
              userLowId,
              userHighId,
            },
          },
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                    role: { select: { name: true } },
                    department: true,
                    position: true,
                    currentCompany: true,
                  },
                },
              },
            },
            lastMessage: true,
          },
        });

        if (raceExisting) {
          return raceExisting;
        }
      }
      throw err;
    }
  },

  async findUserConversations(
    universityId: string,
    userId: string,
    params: {
      tab?: 'all' | 'unread' | 'archived';
      q?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { tab = 'all', q, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const participantWhere: Prisma.ConversationParticipantWhereInput = {
      userId,
    };

    if (tab === 'archived') {
      participantWhere.isArchived = true;
    } else if (tab === 'unread') {
      participantWhere.isArchived = false;
      participantWhere.unreadCount = { gt: 0 };
    } else {
      // 'all' tab excludes archived chats
      participantWhere.isArchived = false;
    }

    const where: Prisma.ConversationWhereInput = {
      universityId,
      participants: {
        some: participantWhere,
      },
    };

    if (q && q.trim().length > 0) {
      const search = q.trim();
      where.participants = {
        some: {
          AND: [
            participantWhere,
            {
              conversation: {
                participants: {
                  some: {
                    userId: { not: userId },
                    user: {
                      name: {
                        contains: search,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      };
    }

    const [total, conversations] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  role: { select: { name: true } },
                  department: true,
                  position: true,
                  currentCompany: true,
                },
              },
            },
          },
          lastMessage: {
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
      }),
    ]);

    // Sort pinned conversations to the top for the requesting user
    conversations.sort((a, b) => {
      const aParticipant = a.participants.find((p) => p.userId === userId);
      const bParticipant = b.participants.find((p) => p.userId === userId);
      const aPinned = aParticipant?.isPinned ? 1 : 0;
      const bPinned = bParticipant?.isPinned ? 1 : 0;
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      const aTime = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
      const bTime = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
      return bTime - aTime;
    });

    return {
      conversations,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async updateLastMessage(
    conversationId: string,
    messageId: string,
    snippet: string,
    timestamp: Date,
  ) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageId: messageId,
        lastMessageSnippet: snippet.slice(0, 250),
        lastMessageAt: timestamp,
      },
    });
  },

  async updateParticipantPreferences(
    conversationId: string,
    userId: string,
    data: {
      isArchived?: boolean;
      isMuted?: boolean;
      isPinned?: boolean;
    },
  ) {
    return prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data,
    });
  },

  async incrementUnread(conversationId: string, recipientUserId: string) {
    return prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId: recipientUserId,
        },
      },
      data: {
        unreadCount: { increment: 1 },
      },
    });
  },

  async resetUnread(conversationId: string, userId: string) {
    return prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    });
  },

  async getTotalUnreadCount(userId: string): Promise<number> {
    const aggregate = await prisma.conversationParticipant.aggregate({
      where: {
        userId,
        isArchived: false,
      },
      _sum: {
        unreadCount: true,
      },
    });
    return aggregate._sum.unreadCount ?? 0;
  },

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      select: { id: true },
    });
    return !!participant;
  },
};
