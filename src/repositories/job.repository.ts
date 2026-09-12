import type { JobStatus, Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export const jobRepository = {
  listPublished(universityId: string, pagination: PaginationInput) {
    const where: Prisma.JobWhereInput = {
      universityId,
      status: 'APPROVED',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    return prisma.$transaction([
      prisma.job.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          company: true,
          location: true,
          employmentType: true,
          applicationUrl: true,
          applicationEmail: true,
          expiresAt: true,
          createdAt: true,
          postedBy: { select: { id: true, name: true, currentCompany: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.job.count({ where }),
    ]);
  },

  create(input: {
    universityId: string;
    postedById: string;
    title: string;
    description: string;
    company: string;
    location?: string;
    employmentType?: string;
    applicationUrl?: string;
    applicationEmail?: string;
    expiresAt?: Date;
  }) {
    return prisma.job.create({ data: input });
  },

  findById(id: string) {
    return prisma.job.findUnique({ where: { id } });
  },

  review(input: {
    jobId: string;
    reviewerId: string;
    status: Extract<JobStatus, 'APPROVED' | 'REJECTED'>;
    rejectionReason?: string;
  }) {
    return prisma.job.update({
      where: { id: input.jobId },
      data: {
        status: input.status,
        approvedById: input.reviewerId,
        approvedAt: input.status === 'APPROVED' ? new Date() : null,
        rejectionReason: input.status === 'REJECTED' ? input.rejectionReason : null,
      },
    });
  },

  apply(jobId: string, applicantId: string, message?: string) {
    return prisma.jobApplication.create({ data: { jobId, applicantId, message } });
  },
};
