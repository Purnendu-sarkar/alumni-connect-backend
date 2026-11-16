import type { Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export const jobModerationRepository = {
  createRecord(data: Prisma.JobModerationRecordUncheckedCreateInput) {
    return prisma.jobModerationRecord.create({
      data,
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });
  },

  listRecordsByJobId(jobId: string) {
    return prisma.jobModerationRecord.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });
  },

  getLatestRecord(jobId: string) {
    return prisma.jobModerationRecord.findFirst({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true } },
      },
    });
  },
};
