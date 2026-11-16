import type { JobStatus, Prisma, WorkMode, ExperienceLevel } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

export interface JobFilterParams {
  q?: string;
  category?: string;
  employmentType?: string;
  workMode?: string;
  experienceLevel?: string;
  location?: string;
  referralAvailable?: boolean;
  postedWithinDays?: number;
  sort?: 'newest' | 'closing_soon';
}

export interface ModerationQueueFilters {
  status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'DECIDED' | 'ALL';
  mine?: boolean;
  category?: string;
  q?: string;
  reviewerId?: string;
}

export const jobRepository = {
  async searchPublishedJobs(
    universityId: string,
    filters: JobFilterParams,
    pagination: PaginationInput,
  ) {
    const now = new Date();
    const where: Prisma.JobWhereInput = {
      universityId,
      deletedAt: null,
      status: { in: ['PUBLISHED', 'APPROVED'] as JobStatus[] },
      deadline: { gte: now },
      postedBy: {
        isActive: true,
      },
    };

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.category && filters.category !== 'All') {
      where.category = { equals: filters.category, mode: 'insensitive' };
    }

    if (filters.employmentType && filters.employmentType !== 'All') {
      where.employmentType = { equals: filters.employmentType, mode: 'insensitive' };
    }

    if (filters.workMode && filters.workMode !== 'All') {
      where.workMode = filters.workMode as WorkMode;
    }

    if (filters.experienceLevel && filters.experienceLevel !== 'All') {
      where.experienceLevel = filters.experienceLevel as ExperienceLevel;
    }

    if (filters.location?.trim()) {
      where.location = { contains: filters.location.trim(), mode: 'insensitive' };
    }

    if (typeof filters.referralAvailable === 'boolean') {
      where.referralAvailable = filters.referralAvailable;
    }

    if (filters.postedWithinDays && filters.postedWithinDays > 0) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - filters.postedWithinDays);
      where.createdAt = { gte: pastDate };
    }

    const orderBy: Prisma.JobOrderByWithRelationInput =
      filters.sort === 'closing_soon'
        ? { deadline: 'asc' }
        : { publishedAt: 'desc' };

    return prisma.$transaction([
      prisma.job.findMany({
        where,
        select: {
          id: true,
          universityId: true,
          postedById: true,
          title: true,
          company: true,
          category: true,
          description: true,
          requirements: true,
          employmentType: true,
          workMode: true,
          experienceLevel: true,
          location: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          deadline: true,
          expiresAt: true,
          referralAvailable: true,
          requireResume: true,
          requireCoverLetter: true,
          status: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { applications: true },
          },
          postedBy: {
            select: {
              id: true,
              name: true,
              currentCompany: true,
              position: true,
              department: true,
              batch: true,
              avatarUrl: true,
              verified: true,
            },
          },
        },
        orderBy,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.job.count({ where }),
    ]);
  },

  create(data: Prisma.JobUncheckedCreateInput) {
    return prisma.job.create({
      data,
      include: {
        postedBy: {
          select: { id: true, name: true, email: true, currentCompany: true },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.job.findFirst({
      where: { id, deletedAt: null },
      include: {
        postedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            phonePublic: true,
            currentCompany: true,
            position: true,
            department: true,
            batch: true,
            avatarUrl: true,
            verified: true,
          },
        },
        reviewer: {
          select: { id: true, name: true, email: true },
        },
        moderations: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { applications: true },
        },
      },
    });
  },

  findOwnerJobById(id: string, postedById: string) {
    return prisma.job.findFirst({
      where: { id, postedById, deletedAt: null },
      include: {
        postedBy: {
          select: { id: true, name: true, email: true, currentCompany: true },
        },
        moderations: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { applications: true },
        },
      },
    });
  },

  update(id: string, data: Prisma.JobUncheckedUpdateInput) {
    return prisma.job.update({
      where: { id },
      data,
    });
  },

  softDelete(id: string) {
    return prisma.job.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async atomicClaim(jobId: string, universityId: string, reviewerId: string) {
    const result = await prisma.job.updateMany({
      where: {
        id: jobId,
        universityId,
        status: 'SUBMITTED',
        deletedAt: null,
      },
      data: {
        status: 'UNDER_REVIEW',
        reviewerId,
        claimedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  },

  async atomicReleaseClaim(jobId: string, reviewerId: string, isSuperAdmin = false) {
    const where: Prisma.JobWhereInput = {
      id: jobId,
      status: 'UNDER_REVIEW',
      deletedAt: null,
    };
    if (!isSuperAdmin) {
      where.reviewerId = reviewerId;
    }

    const result = await prisma.job.updateMany({
      where,
      data: {
        status: 'SUBMITTED',
        reviewerId: null,
        claimedAt: null,
        version: { increment: 1 },
      },
    });
    return result.count > 0;
  },

  listModerationQueue(
    universityId: string,
    filters: ModerationQueueFilters,
    pagination: PaginationInput,
  ) {
    const where: Prisma.JobWhereInput = {
      universityId,
      deletedAt: null,
    };

    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'DECIDED') {
        where.status = { in: ['APPROVED', 'REJECTED', 'PUBLISHED', 'CLOSED'] as JobStatus[] };
      } else {
        where.status = filters.status as JobStatus;
      }
    }

    if (filters.mine && filters.reviewerId) {
      where.reviewerId = filters.reviewerId;
    }

    if (filters.category && filters.category !== 'All') {
      where.category = { equals: filters.category, mode: 'insensitive' };
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    return prisma.$transaction([
      prisma.job.findMany({
        where,
        include: {
          postedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              currentCompany: true,
              position: true,
              department: true,
              batch: true,
              verified: true,
              verificationStatus: true,
            },
          },
          reviewer: {
            select: { id: true, name: true, email: true },
          },
          moderations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { submittedAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.job.count({ where }),
    ]);
  },

  listAdminJobs(
    universityId: string,
    filters: { status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const where: Prisma.JobWhereInput = {
      universityId,
      deletedAt: null,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status as JobStatus;
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { company: { contains: q, mode: 'insensitive' } },
        { postedBy: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    return prisma.$transaction([
      prisma.job.findMany({
        where,
        include: {
          postedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              currentCompany: true,
              verified: true,
            },
          },
          reviewer: {
            select: { id: true, name: true },
          },
          _count: {
            select: { applications: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      prisma.job.count({ where }),
    ]);
  },

  listMyPosted(userId: string) {
    return prisma.job.findMany({
      where: { postedById: userId, deletedAt: null },
      include: {
        moderations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { applications: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  closeJob(jobId: string, closedById: string, closedReason?: string) {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById,
        closedReason: closedReason?.trim() || 'Closed by user/admin',
        version: { increment: 1 },
      },
    });
  },

  // -------------------------------------------------------------
  // Legacy / Backward-compatible methods
  // -------------------------------------------------------------
  listPublished(universityId: string, pagination: PaginationInput) {
    return this.searchPublishedJobs(universityId, {}, pagination);
  },

  listPending(universityId: string, pagination: PaginationInput) {
    return this.listModerationQueue(
      universityId,
      { status: 'SUBMITTED' },
      pagination,
    );
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
        reviewerId: input.reviewerId,
        approvedById: input.reviewerId,
        approvedAt: input.status === 'APPROVED' ? new Date() : null,
        publishedAt: input.status === 'APPROVED' ? new Date() : null,
        rejectionReason: input.status === 'REJECTED' ? input.rejectionReason : null,
        version: { increment: 1 },
      },
    });
  },

  apply(jobId: string, applicantId: string, message?: string) {
    return prisma.jobApplication.create({
      data: {
        jobId,
        applicantId,
        message,
        coverLetter: message,
        status: 'APPLIED',
      },
    });
  },

  listMyApplications(userId: string) {
    return prisma.jobApplication.findMany({
      where: { applicantId: userId },
      select: {
        id: true,
        createdAt: true,
        message: true,
        coverLetter: true,
        status: true,
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            employmentType: true,
            status: true,
            deadline: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
