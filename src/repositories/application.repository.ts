import type { ApplicationStatus, Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export const applicationRepository = {
  create(data: Prisma.JobApplicationUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      const app = await tx.jobApplication.create({
        data,
      });

      await tx.jobApplicationStatusHistory.create({
        data: {
          applicationId: app.id,
          fromStatus: null,
          toStatus: app.status,
          changedById: data.applicantId,
          note: 'Application submitted',
        },
      });

      return app;
    });
  },

  findById(id: string) {
    return prisma.jobApplication.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            category: true,
            employmentType: true,
            workMode: true,
            postedById: true,
            status: true,
            deadline: true,
          },
        },
        applicant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            phonePublic: true,
            department: true,
            batch: true,
            currentCompany: true,
            position: true,
            avatarUrl: true,
            verified: true,
          },
        },
        history: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: { select: { id: true, name: true } },
          },
        },
      },
    });
  },

  findByJobAndApplicant(jobId: string, applicantId: string) {
    return prisma.jobApplication.findUnique({
      where: {
        jobId_applicantId: {
          jobId,
          applicantId,
        },
      },
    });
  },

  listCandidateApplications(applicantId: string, pagination: PaginationInput) {
    const where: Prisma.JobApplicationWhereInput = {
      applicantId,
    };

    return prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              location: true,
              category: true,
              employmentType: true,
              workMode: true,
              deadline: true,
              status: true,
              postedBy: {
                select: { id: true, name: true, currentCompany: true },
              },
            },
          },
          history: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.jobApplication.count({ where }),
    ]);
  },

  listApplicationsByJob(
    jobId: string,
    filters: { status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const where: Prisma.JobApplicationWhereInput = {
      jobId,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status as ApplicationStatus;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { applicant: { name: { contains: q, mode: 'insensitive' } } },
        { applicant: { email: { contains: q, mode: 'insensitive' } } },
        { applicant: { department: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          applicant: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              phonePublic: true,
              department: true,
              batch: true,
              studentId: true,
              currentCompany: true,
              position: true,
              avatarUrl: true,
              verified: true,
              verificationStatus: true,
              isActive: true,
            },
          },
          history: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.jobApplication.count({ where }),
    ]);
  },

  listAllReceivedApplicationsForOwner(
    ownerId: string,
    filters: { jobId?: string; status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const where: Prisma.JobApplicationWhereInput = {
      job: {
        postedById: ownerId,
        deletedAt: null,
      },
    };

    if (filters.jobId && filters.jobId !== 'ALL') {
      where.jobId = filters.jobId;
    }

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status as ApplicationStatus;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { applicant: { name: { contains: q, mode: 'insensitive' } } },
        { applicant: { email: { contains: q, mode: 'insensitive' } } },
        { job: { title: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return prisma.$transaction([
      prisma.jobApplication.findMany({
        where,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              company: true,
              status: true,
              deadline: true,
            },
          },
          applicant: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              phonePublic: true,
              department: true,
              batch: true,
              currentCompany: true,
              position: true,
              avatarUrl: true,
              verified: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.jobApplication.count({ where }),
    ]);
  },

  updateStatusWithHistory(
    applicationId: string,
    fromStatus: ApplicationStatus,
    toStatus: ApplicationStatus,
    changedById: string,
    ownerNote?: string | null,
    statusNote?: string | null,
  ) {
    return prisma.$transaction(async (tx) => {
      const updateData: Prisma.JobApplicationUpdateInput = {
        status: toStatus,
      };

      if (ownerNote !== undefined) {
        updateData.ownerNote = ownerNote;
      }

      const updated = await tx.jobApplication.update({
        where: { id: applicationId },
        data: updateData,
        include: {
          job: {
            select: {
              id: true,
              title: true,
              postedById: true,
            },
          },
          applicant: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.jobApplicationStatusHistory.create({
        data: {
          applicationId,
          fromStatus,
          toStatus,
          changedById,
          note: statusNote || `Status changed to ${toStatus}`,
        },
      });

      return updated;
    });
  },

  withdrawApplication(id: string, applicantId: string, note?: string) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.jobApplication.update({
        where: { id },
        data: {
          status: 'WITHDRAWN',
          withdrawnAt: new Date(),
        },
        include: {
          job: { select: { id: true, title: true, postedById: true } },
        },
      });

      await tx.jobApplicationStatusHistory.create({
        data: {
          applicationId: id,
          fromStatus: updated.status,
          toStatus: 'WITHDRAWN',
          changedById: applicantId,
          note: note?.trim() || 'Candidate withdrew application',
        },
      });

      return updated;
    });
  },

  async countApplicationsByStatus(jobId: string) {
    const counts = await prisma.jobApplication.groupBy({
      by: ['status'],
      where: { jobId },
      _count: true,
    });

    const summary: Record<string, number> = {
      TOTAL: 0,
      APPLIED: 0,
      UNDER_REVIEW: 0,
      SHORTLISTED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    };

    for (const item of counts) {
      summary[item.status] = item._count;
      summary.TOTAL = (summary.TOTAL ?? 0) + item._count;
    }

    return summary;
  },
};
