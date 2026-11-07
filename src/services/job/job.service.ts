import {
  EmploymentType,
  JobModerationAction,
  JobStatus,
  ModerationReasonCode,
  Role,
  WorkMode,
} from '@prisma/client';

import { prisma } from '../../config/database.js';
import { bumpVersion } from '../../config/redis.js';
import { ApiError } from '../../errors/api-error.js';
import { jobModel } from '../../models/job.model.js';
import { auditLogModel } from '../../models/audit-log.model.js';

export const jobService = {
  async listActive(options: {
    employmentType?: EmploymentType;
    workMode?: WorkMode;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    return jobModel.list({
      ...options,
      status: JobStatus.PUBLISHED,
    });
  },

  async findById(id: string) {
    const job = await jobModel.findById(id);
    if (!job) throw ApiError.notFound('Job listing');
    return job;
  },

  async create(input: {
    creatorId: string;
    creatorRole: Role;
    title: string;
    company: string;
    description: string;
    category?: string;
    location?: string;
    employmentType: EmploymentType;
    workMode?: WorkMode;
    requirements?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    deadline?: Date;
  }) {
    // Only ALUMNI can post jobs; SUPER_ADMIN manages/overrides
    if (input.creatorRole !== Role.ALUMNI && input.creatorRole !== Role.SUPER_ADMIN) {
      throw ApiError.forbidden('Only alumni members and administrators can publish job opportunities.');
    }

    // Default status: SUBMITTED for review unless created directly by SUPER_ADMIN
    const initialStatus =
      input.creatorRole === Role.SUPER_ADMIN ? JobStatus.PUBLISHED : JobStatus.SUBMITTED;

    const job = await jobModel.create({
      title: input.title,
      company: input.company,
      description: input.description,
      category: input.category ?? 'General',
      location: input.location,
      employmentType: input.employmentType,
      workMode: input.workMode ?? WorkMode.ON_SITE,
      requirements: input.requirements,
      salaryMin: input.salaryMin,
      salaryMax: input.salaryMax,
      salaryCurrency: input.salaryCurrency ?? 'BDT',
      deadline: input.deadline,
      status: initialStatus,
      submittedAt: new Date(),
      publishedAt: initialStatus === JobStatus.PUBLISHED ? new Date() : undefined,
      owner: { connect: { id: input.creatorId } },
    });

    if (initialStatus === JobStatus.PUBLISHED) {
      await bumpVersion('jobs');
    }

    await auditLogModel.record({
      actorId: input.creatorId,
      actorRole: input.creatorRole,
      action: 'JOB_CREATE',
      targetType: 'Job',
      targetId: job.id,
      metadata: { initialStatus },
    });

    return job;
  },

  async moderate(input: {
    jobId: string;
    moderatorId: string;
    moderatorRole: Role;
    action: 'APPROVE' | 'REJECT';
    reasonCode?: ModerationReasonCode;
    note?: string;
  }) {
    const job = await jobModel.findById(input.jobId);
    if (!job) throw ApiError.notFound('Job listing');

    const nextStatus = input.action === 'APPROVE' ? JobStatus.PUBLISHED : JobStatus.REJECTED;
    const modAction =
      input.action === 'APPROVE' ? JobModerationAction.APPROVED : JobModerationAction.REJECTED;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedJob = await tx.job.update({
        where: { id: input.jobId },
        data: {
          status: nextStatus,
          publishedAt: nextStatus === JobStatus.PUBLISHED ? new Date() : undefined,
          reviewerId: input.moderatorId,
          version: { increment: 1 },
        },
      });

      await tx.jobModerationRecord.create({
        data: {
          jobId: input.jobId,
          actorId: input.moderatorId,
          actorRole: input.moderatorRole,
          action: modAction,
          reasonCode: input.reasonCode,
          ownerVisibleNote: input.note,
        },
      });

      return updatedJob;
    });

    await bumpVersion('jobs');

    await auditLogModel.record({
      actorId: input.moderatorId,
      actorRole: input.moderatorRole,
      action: `JOB_MODERATE_${input.action}`,
      targetType: 'Job',
      targetId: updated.id,
      metadata: { note: input.note },
    });

    return updated;
  },

  async apply(input: {
    jobId: string;
    applicantId: string;
    applicantRole: Role;
    coverLetter?: string;
    resumeUrl?: string;
  }) {
    const job = await jobModel.findById(input.jobId);
    if (!job || job.status !== JobStatus.PUBLISHED) {
      throw ApiError.badRequest('This job listing is not accepting applications.');
    }

    const alreadyApplied = await jobModel.hasUserApplied(input.jobId, input.applicantId);
    if (alreadyApplied) {
      throw ApiError.conflict('You have already applied for this job listing.');
    }

    const application = await jobModel.apply(input);

    await auditLogModel.record({
      actorId: input.applicantId,
      actorRole: input.applicantRole,
      action: 'JOB_APPLY',
      targetType: 'JobApplication',
      targetId: application.id,
    });

    return application;
  },
};
