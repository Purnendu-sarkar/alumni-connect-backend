import type { Prisma, StoryModerationAction } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';

export interface CreateModerationRecordInput {
  storyId: string;
  moderatorId: string;
  action: StoryModerationAction;
  reasonCode?: string | null;
  note?: string | null;
}

export const storyModerationRepository = {
  async record(input: CreateModerationRecordInput, tx: Prisma.TransactionClient = prisma) {
    return tx.storyModerationRecord.create({
      data: {
        storyId: input.storyId,
        moderatorId: input.moderatorId,
        action: input.action,
        reasonCode: input.reasonCode,
        note: input.note,
      },
      include: {
        moderator: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
  },

  async findByStoryId(storyId: string, tx: Prisma.TransactionClient = prisma) {
    return tx.storyModerationRecord.findMany({
      where: { storyId },
      include: {
        moderator: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
