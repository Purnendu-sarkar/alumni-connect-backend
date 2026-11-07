import { prisma } from '../config/database.js';
import type { Prisma, JobStatus, EmploymentType, WorkMode } from '@prisma/client';

export const jobModel = {
  findById(id: string) {
    return prisma.job.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            role: true,
            profile: {
              select: {
                fullName: true,
                currentJob: true,
                company: true,
              },
            },
          },
        },
        _count: {
          select: { applications: true },
        },
      },
    });
  },

  create(data: Prisma.JobCreateInput) {
    return prisma.job.create({
      data,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  },

  update(id: string, data: Prisma.JobUpdateInput) {
    return prisma.job.update({
      where: { id },
      data,
      include: {
        owner: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  },

  list(options: {
    status?: JobStatus;
    employmentType?: EmploymentType;
    workMode?: WorkMode;
    ownerId?: string;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.JobWhereInput = {};

    if (options.status) where.status = options.status;
    if (options.employmentType) where.employmentType = options.employmentType;
    if (options.workMode) where.workMode = options.workMode;
    if (options.ownerId) where.ownerId = options.ownerId;

    if (options.search) {
      where.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { company: { contains: options.search, mode: 'insensitive' } },
        { location: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    return Promise.all([
      prisma.job.findMany({
        where,
        skip: options.skip ?? 0,
        take: options.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                  company: true,
                  currentJob: true,
                },
              },
            },
          },
          _count: {
            select: { applications: true },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);
  },

  apply(data: {
    jobId: string;
    applicantId: string;
    coverLetter?: string;
    resumeUrl?: string;
  }) {
    return prisma.jobApplication.create({
      data: {
        jobId: data.jobId,
        applicantId: data.applicantId,
        coverLetter: data.coverLetter,
        resumeUrl: data.resumeUrl,
      },
      include: {
        job: true,
        applicant: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
      },
    });
  },

  hasUserApplied(jobId: string, applicantId: string) {
    return prisma.jobApplication.findUnique({
      where: {
        jobId_applicantId: {
          jobId,
          applicantId,
        },
      },
    });
  },
};
