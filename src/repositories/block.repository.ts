import { prisma } from '../config/database.js';

export const blockRepository = {
  findBlock(firstUserId: string, secondUserId: string) {
    return prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: firstUserId, blockedId: secondUserId },
          { blockerId: secondUserId, blockedId: firstUserId },
        ],
      },
    });
  },

  findDirectBlock(blockerId: string, blockedId: string) {
    return prisma.block.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });
  },

  create(data: { blockerId: string; blockedId: string; reason?: string }) {
    return prisma.block.create({
      data,
    });
  },

  delete(blockerId: string, blockedId: string) {
    return prisma.block.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });
  },

  listBlockedByUser(blockerId: string) {
    return prisma.block.findMany({
      where: { blockerId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await prisma.block.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const set = new Set<string>();
    for (const b of blocks) {
      if (b.blockerId === userId) set.add(b.blockedId);
      if (b.blockedId === userId) set.add(b.blockerId);
    }
    return Array.from(set);
  },
};
