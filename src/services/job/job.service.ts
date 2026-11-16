import type { Prisma, WorkMode, ExperienceLevel } from '../../generated/prisma/client.js';

import { ApiError } from '../../errors/api-error.js';
import { applicationRepository } from '../../repositories/application.repository.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { jobModerationRepository } from '../../repositories/job-moderation.repository.js';
import { jobRepository, type JobFilterParams } from '../../repositories/job.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { jobPresenter } from '../../presenters/job.presenter.js';
import type { PaginationInput } from '../../utils/pagination.js';

export const jobService = {
  async searchJobs(
    universityId: string,
    filters: JobFilterParams,
    pagination: PaginationInput,
    viewerId?: string,
  ) {
    const version = await cacheService.getVersion('jobs');
    const queryHash = Buffer.from(
      JSON.stringify({
        q: filters.q?.trim().toLowerCase() ?? '',
        cat: filters.category ?? '',
        type: filters.employmentType ?? '',
        wm: filters.workMode ?? '',
        exp: filters.experienceLevel ?? '',
        loc: filters.location?.trim().toLowerCase() ?? '',
        ref: filters.referralAvailable ? '1' : '',
        days: filters.postedWithinDays ?? 0,
        sort: filters.sort ?? 'newest',
        p: pagination.page,
        lim: pagination.limit,
      }),
    ).toString('base64url');

    const cacheKey = `jobs:v${version}:${universityId}:${queryHash}`;
    let cached = await cacheService.get<{
      jobs: Awaited<ReturnType<typeof jobRepository.searchPublishedJobs>>[0];
      total: number;
    }>(cacheKey);

    if (!cached) {
      const [jobs, total] = await jobRepository.searchPublishedJobs(
        universityId,
        filters,
        pagination,
      );
      cached = { jobs, total };
      await cacheService.set(cacheKey, cached, 120);
    }

    // Attach viewer-specific application status if authenticated
    let userApplicationsMap: Map<string, string> = new Map();
    if (viewerId && cached.jobs.length > 0) {
      const jobIds = cached.jobs.map((j) => j.id);
      const userApps = await applicationRepository.listCandidateApplications(viewerId, {
        page: 1,
        limit: 100,
      });
      userApplicationsMap = new Map(
        userApps[0].filter((a) => jobIds.includes(a.jobId)).map((a) => [a.jobId, a.status]),
      );
    }

    const cards = cached.jobs.map((job) => {
      const appStatus = userApplicationsMap.get(job.id);
      return jobPresenter.toPublishedCard(job, {
        userId: viewerId,
        hasApplied: Boolean(appStatus),
        applicationStatus: appStatus || null,
      });
    });

    return [cards, cached.total] as const;
  },

  async createJob(
    userId: string,
    universityId: string,
    input: {
      title: string;
      company: string;
      category?: string;
      description: string;
      requirements?: string | null;
      employmentType?: string;
      workMode?: string;
      experienceLevel?: string;
      location?: string | null;
      salaryMin?: number | null;
      salaryMax?: number | null;
      salaryCurrency?: string;
      deadline: Date;
      referralAvailable?: boolean;
      requireResume?: boolean;
      requireCoverLetter?: boolean;
      applicationUrl?: string | null;
      applicationEmail?: string | null;
      submitNow?: boolean;
    },
  ) {
    const isSubmitted = Boolean(input.submitNow);
    const initialStatus = isSubmitted ? 'SUBMITTED' : 'DRAFT';
    const now = new Date();

    const data: Prisma.JobUncheckedCreateInput = {
      universityId,
      postedById: userId,
      title: input.title.trim(),
      company: input.company.trim(),
      category: input.category?.trim() || 'General',
      description: input.description.trim(),
      requirements: input.requirements?.trim() || null,
      employmentType: input.employmentType?.trim() || 'FULL_TIME',
      workMode: (input.workMode as WorkMode) || 'ON_SITE',
      experienceLevel: (input.experienceLevel as ExperienceLevel) || 'ANY',
      location: input.location?.trim() || null,
      salaryMin: input.salaryMin ?? null,
      salaryMax: input.salaryMax ?? null,
      salaryCurrency: input.salaryCurrency?.trim() || 'BDT',
      deadline: input.deadline,
      expiresAt: input.deadline,
      referralAvailable: Boolean(input.referralAvailable),
      requireResume: Boolean(input.requireResume),
      requireCoverLetter: Boolean(input.requireCoverLetter),
      applicationUrl: input.applicationUrl?.trim() || null,
      applicationEmail: input.applicationEmail?.trim() || null,
      status: initialStatus,
      submittedAt: isSubmitted ? now : null,
      version: 1,
    };

    const job = await jobRepository.create(data);

    if (isSubmitted) {
      await jobModerationRepository.createRecord({
        jobId: job.id,
        actorId: userId,
        actorRole: 'ALUMNI',
        action: 'SUBMIT',
        ownerVisibleNote: 'Job submitted for institutional review',
      });
    }

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: isSubmitted ? 'JOB_SUBMITTED' : 'JOB_CREATED',
      targetType: 'job',
      targetId: job.id,
      metadata: { title: job.title, company: job.company, status: job.status },
    });

    return job;
  },

  async updateJob(
    userId: string,
    universityId: string,
    jobId: string,
    input: {
      title?: string;
      company?: string;
      category?: string;
      description?: string;
      requirements?: string | null;
      employmentType?: string;
      workMode?: string;
      experienceLevel?: string;
      location?: string | null;
      salaryMin?: number | null;
      salaryMax?: number | null;
      salaryCurrency?: string;
      deadline?: Date;
      referralAvailable?: boolean;
      requireResume?: boolean;
      requireCoverLetter?: boolean;
      applicationUrl?: string | null;
      applicationEmail?: string | null;
      submitNow?: boolean;
    },
  ) {
    const existing = await jobRepository.findOwnerJobById(jobId, userId);
    if (!existing) {
      throw ApiError.notFound('Job listing not found or access denied');
    }

    const editableStatuses = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED', 'PUBLISHED', 'APPROVED'];
    if (!editableStatuses.includes(existing.status)) {
      throw ApiError.conflict(
        `Cannot edit job while in "${existing.status}" status. Only draft, feedback, or active jobs may be edited.`,
      );
    }

    const isCurrentlyPublished = existing.status === 'PUBLISHED' || existing.status === 'APPROVED';
    const updateData: Prisma.JobUpdateInput = {};

    if (input.title) updateData.title = input.title.trim();
    if (input.company) updateData.company = input.company.trim();
    if (input.category) updateData.category = input.category.trim();
    if (input.description) updateData.description = input.description.trim();
    if (input.requirements !== undefined) updateData.requirements = input.requirements?.trim() || null;
    if (input.employmentType) updateData.employmentType = input.employmentType.trim();
    if (input.workMode) updateData.workMode = input.workMode as WorkMode;
    if (input.experienceLevel) updateData.experienceLevel = input.experienceLevel as ExperienceLevel;
    if (input.location !== undefined) updateData.location = input.location?.trim() || null;
    if (input.salaryMin !== undefined) updateData.salaryMin = input.salaryMin;
    if (input.salaryMax !== undefined) updateData.salaryMax = input.salaryMax;
    if (input.salaryCurrency) updateData.salaryCurrency = input.salaryCurrency.trim();
    if (input.deadline) {
      updateData.deadline = input.deadline;
      updateData.expiresAt = input.deadline;
    }
    if (typeof input.referralAvailable === 'boolean') updateData.referralAvailable = input.referralAvailable;
    if (typeof input.requireResume === 'boolean') updateData.requireResume = input.requireResume;
    if (typeof input.requireCoverLetter === 'boolean') updateData.requireCoverLetter = input.requireCoverLetter;
    if (input.applicationUrl !== undefined) updateData.applicationUrl = input.applicationUrl?.trim() || null;
    if (input.applicationEmail !== undefined) updateData.applicationEmail = input.applicationEmail?.trim() || null;

    updateData.version = { increment: 1 };

    // Critical fields detection for published job re-review
    const criticalFieldsChanged =
      (input.title && input.title !== existing.title) ||
      (input.company && input.company !== existing.company) ||
      (input.description && input.description !== existing.description) ||
      (input.requirements !== undefined && input.requirements !== existing.requirements) ||
      (input.location !== undefined && input.location !== existing.location) ||
      (input.salaryMin !== undefined && input.salaryMin !== existing.salaryMin) ||
      (input.salaryMax !== undefined && input.salaryMax !== existing.salaryMax);

    if (isCurrentlyPublished && criticalFieldsChanged) {
      // Revert to UNDER_REVIEW to prevent bait-and-switch scams
      updateData.status = 'UNDER_REVIEW';
      await cacheService.bumpVersion('jobs');

      await jobModerationRepository.createRecord({
        jobId,
        actorId: userId,
        actorRole: 'ALUMNI',
        action: 'SUBMIT',
        ownerVisibleNote: 'Listing edited by owner. Reverted to moderation queue for verification.',
        internalNote: 'Automatic security status rollback: critical fields modified on published job.',
      });
    } else if (input.submitNow && (existing.status === 'DRAFT' || existing.status === 'CHANGES_REQUESTED')) {
      updateData.status = 'SUBMITTED';
      updateData.submittedAt = new Date();

      await jobModerationRepository.createRecord({
        jobId,
        actorId: userId,
        actorRole: 'ALUMNI',
        action: 'SUBMIT',
        ownerVisibleNote: 'Updated job resubmitted for institutional moderation.',
      });
    }

    const updated = await jobRepository.update(jobId, updateData);

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'JOB_UPDATED',
      targetType: 'job',
      targetId: jobId,
      metadata: { isPublished: isCurrentlyPublished, criticalFieldsChanged },
    });

    return updated;
  },

  async submitJob(userId: string, universityId: string, jobId: string) {
    const job = await jobRepository.findOwnerJobById(jobId, userId);
    if (!job) throw ApiError.notFound('Job listing');

    const submittableStatuses = ['DRAFT', 'CHANGES_REQUESTED', 'REJECTED'];
    if (!submittableStatuses.includes(job.status)) {
      throw ApiError.conflict(`Job cannot be submitted from "${job.status}" status.`);
    }

    if (job.deadline < new Date()) {
      throw ApiError.badRequest('Cannot submit a job listing with an expired deadline.');
    }

    const updated = await jobRepository.update(jobId, {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      version: { increment: 1 },
    });

    await jobModerationRepository.createRecord({
      jobId,
      actorId: userId,
      actorRole: 'ALUMNI',
      action: 'SUBMIT',
      ownerVisibleNote: 'Job submitted for institutional review.',
    });

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'JOB_SUBMITTED',
      targetType: 'job',
      targetId: jobId,
    });

    return updated;
  },

  async withdrawJob(userId: string, universityId: string, jobId: string) {
    const job = await jobRepository.findOwnerJobById(jobId, userId);
    if (!job) throw ApiError.notFound('Job listing');

    if (job.status === 'UNDER_REVIEW') {
      throw new ApiError(
        409,
        'Cannot withdraw submission: A moderator has already claimed this listing for review.',
        'ALREADY_CLAIMED',
      );
    }

    if (job.status !== 'SUBMITTED') {
      throw ApiError.conflict('Only actively submitted job listings can be withdrawn.');
    }

    const updated = await jobRepository.update(jobId, {
      status: 'DRAFT',
      submittedAt: null,
      version: { increment: 1 },
    });

    await jobModerationRepository.createRecord({
      jobId,
      actorId: userId,
      actorRole: 'ALUMNI',
      action: 'WITHDRAW',
      ownerVisibleNote: 'Job submission withdrawn by owner back to Draft status.',
    });

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'JOB_WITHDRAWN',
      targetType: 'job',
      targetId: jobId,
    });

    return updated;
  },

  async duplicateJob(userId: string, universityId: string, jobId: string) {
    const original = await jobRepository.findById(jobId);
    if (!original) throw ApiError.notFound('Original job listing');

    const futureDeadline = new Date();
    futureDeadline.setDate(futureDeadline.getDate() + 30);

    const duplicate = await jobRepository.create({
      universityId,
      postedById: userId,
      title: `${original.title} (Copy)`,
      company: original.company,
      category: original.category,
      description: original.description,
      requirements: original.requirements,
      employmentType: original.employmentType,
      workMode: original.workMode,
      experienceLevel: original.experienceLevel,
      location: original.location,
      salaryMin: original.salaryMin,
      salaryMax: original.salaryMax,
      salaryCurrency: original.salaryCurrency,
      deadline: futureDeadline,
      expiresAt: futureDeadline,
      referralAvailable: original.referralAvailable,
      requireResume: original.requireResume,
      requireCoverLetter: original.requireCoverLetter,
      applicationUrl: original.applicationUrl,
      applicationEmail: original.applicationEmail,
      status: 'DRAFT',
      version: 1,
    });

    return duplicate;
  },

  async closeJob(userId: string, userRole: string, universityId: string, jobId: string, reason?: string) {
    const job = await jobRepository.findById(jobId);
    if (!job) throw ApiError.notFound('Job listing');

    const isOwner = job.postedById === userId;
    const isModOrAdmin = userRole === 'MODERATOR' || userRole === 'SUPER_ADMIN';

    if (!isOwner && !isModOrAdmin) {
      throw ApiError.forbidden('You are not authorized to close this job listing.');
    }

    const closed = await jobRepository.closeJob(jobId, userId, reason);
    await cacheService.bumpVersion('jobs');

    await jobModerationRepository.createRecord({
      jobId,
      actorId: userId,
      actorRole: userRole,
      action: 'CLOSE',
      ownerVisibleNote: reason ? `Closed: ${reason}` : 'Job closed.',
      internalNote: `Closed by ${userRole} (${userId}).`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'JOB_CLOSED',
      targetType: 'job',
      targetId: jobId,
      metadata: { reason, closedByRole: userRole },
    });

    return closed;
  },

  async deleteJob(userId: string, jobId: string) {
    const job = await jobRepository.findOwnerJobById(jobId, userId);
    if (!job) throw ApiError.notFound('Job listing');

    const deletableStatuses = ['DRAFT', 'REJECTED', 'CLOSED'];
    if (!deletableStatuses.includes(job.status)) {
      throw ApiError.conflict('Only draft, rejected, or closed jobs can be deleted.');
    }

    if (job._count?.applications && job._count.applications > 0 && job.status !== 'DRAFT') {
      throw ApiError.conflict('Cannot delete a job with recorded candidate applications.');
    }

    await jobRepository.softDelete(jobId);
    await cacheService.bumpVersion('jobs');

    return { success: true };
  },

  async getJobDetail(jobId: string, viewerId?: string) {
    const job = await jobRepository.findById(jobId);
    if (!job) throw ApiError.notFound('Job listing');

    let hasApplied = false;
    let applicationStatus: string | null = null;

    if (viewerId) {
      const app = await applicationRepository.findByJobAndApplicant(jobId, viewerId);
      if (app) {
        hasApplied = true;
        applicationStatus = app.status;
      }
    }

    return jobPresenter.toDetailView(job, {
      userId: viewerId,
      hasApplied,
      applicationStatus,
    });
  },

  async getOwnerJobDetail(jobId: string, ownerId: string) {
    const job = await jobRepository.findOwnerJobById(jobId, ownerId);
    if (!job) throw ApiError.notFound('Job listing');

    const counts = await applicationRepository.countApplicationsByStatus(jobId);
    return jobPresenter.toOwnerDetail(job, counts);
  },

  async listMyPostedJobs(userId: string) {
    const jobs = await jobRepository.listMyPosted(userId);
    return jobs.map((j) => ({
      ...j,
      applicantCount: j._count?.applications ?? 0,
      latestFeedback:
        j.moderations && j.moderations.length > 0 && j.moderations[0]
          ? j.moderations[0].ownerVisibleNote
          : null,
    }));
  },

  // Backward compatibility
  listPublished(universityId: string, pagination: PaginationInput) {
    return jobRepository.listPublished(universityId, pagination);
  },

  listPending(universityId: string, pagination: PaginationInput) {
    return jobRepository.listPending(universityId, pagination);
  },

  async review(input: {
    jobId: string;
    universityId: string;
    reviewerId: string;
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  }) {
    const job = await jobRepository.findById(input.jobId);
    if (!job || job.universityId !== input.universityId) {
      throw ApiError.notFound('Job');
    }
    return jobRepository.review(input);
  },

  async apply(input: {
    jobId: string;
    universityId: string;
    applicantId: string;
    message?: string;
  }) {
    const job = await jobRepository.findById(input.jobId);
    if (
      !job ||
      job.universityId !== input.universityId ||
      (job.status !== 'APPROVED' && job.status !== 'PUBLISHED')
    ) {
      throw ApiError.notFound('Open job');
    }
    return jobRepository.apply(input.jobId, input.applicantId, input.message);
  },

  listMine(userId: string, role: string) {
    if (role === 'STUDENT') {
      return jobRepository.listMyApplications(userId).then((apps) => ({
        applications: apps,
        postedJobs: [],
      }));
    }
    return this.listMyPostedJobs(userId).then((posted) => ({
      postedJobs: posted,
      applications: [],
    }));
  },

  getById(id: string) {
    return jobRepository.findById(id);
  },
};
