import type { Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export const auditLogRepository = {
  record(input: {
    universityId: string;
    actorId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        ...input,
        metadata: input.metadata,
      },
    });
  },
};
