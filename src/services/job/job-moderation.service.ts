import type { JobStatus } from '../../generated/prisma/client.js';

import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { jobModerationRepository } from '../../repositories/job-moderation.repository.js';
import { jobRepository, type ModerationQueueFilters } from '../../repositories/job.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { notificationService } from '../notification/notification.service.js';
import { jobPresenter } from '../../presenters/job.presenter.js';
import type { PaginationInput } from '../../utils/pagination.js';

export const jobModerationService = {
  async getModerationQueue(
    universityId: string,
    filters: ModerationQueueFilters,
    pagination: PaginationInput,
    moderatorId?: string,
  ) {
    const filtersWithReviewer = {
      ...filters,
      reviewerId: filters.mine ? moderatorId : undefined,
    };

    const [jobs, total] = await jobRepository.listModerationQueue(
      universityId,
      filtersWithReviewer,
      pagination,
    );

    const formatted = jobs.map((job) => ({
      ...jobPresenter.toModerationDetail(job),
      isClaimedByMe: job.reviewerId === moderatorId,
      canClaim: job.status === 'SUBMITTED',
    }));

    return [formatted, total] as const;
  },

  async getModerationJobDetail(jobId: string) {
    const job = await jobRepository.findById(jobId);
    if (!job) throw ApiError.notFound('Job listing');
    return jobPresenter.toModerationDetail(job);
  },

  async claimJob(jobId: string, universityId: string, moderatorId: string) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) {
      throw ApiError.notFound('Job listing');
    }

    if (job.status !== 'SUBMITTED') {
      throw new ApiError(
        409,
        job.status === 'UNDER_REVIEW'
          ? 'This job has already been claimed by another moderator.'
          : 'Job is not in a submittable review state.',
        job.status === 'UNDER_REVIEW' ? 'ALREADY_CLAIMED' : 'CONFLICT',
      );
    }

    // Atomic claim query
    const claimed = await jobRepository.atomicClaim(jobId, universityId, moderatorId);
    if (!claimed) {
      throw new ApiError(409, 'This job has already been claimed by another moderator.', 'ALREADY_CLAIMED');
    }

    await jobModerationRepository.createRecord({
      jobId,
      actorId: moderatorId,
      actorRole: 'MODERATOR',
      action: 'CLAIM',
      ownerVisibleNote: 'Listing claimed by campus moderator for review.',
      internalNote: `Claimed by moderator ${moderatorId}`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'JOB_CLAIMED',
      targetType: 'job',
      targetId: jobId,
    });

    return { success: true, claimedAt: new Date() };
  },

  async unclaimJob(jobId: string, universityId: string, moderatorId: string, isSuperAdmin = false) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) {
      throw ApiError.notFound('Job listing');
    }

    if (job.status !== 'UNDER_REVIEW') {
      throw ApiError.conflict('Job is not currently under review.');
    }

    if (!isSuperAdmin && job.reviewerId !== moderatorId) {
      throw ApiError.forbidden('You can only release jobs you have claimed.');
    }

    const released = await jobRepository.atomicReleaseClaim(jobId, moderatorId, isSuperAdmin);
    if (!released) {
      throw ApiError.conflict('Failed to release review claim.');
    }

    await jobModerationRepository.createRecord({
      jobId,
      actorId: moderatorId,
      actorRole: isSuperAdmin ? 'SUPER_ADMIN' : 'MODERATOR',
      action: 'UNCLAIM',
      ownerVisibleNote: 'Review claim released back to the institutional queue.',
      internalNote: `Claim released by ${isSuperAdmin ? 'SUPER_ADMIN' : 'MODERATOR'} (${moderatorId}).`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'JOB_CLAIM_RELEASED',
      targetType: 'job',
      targetId: jobId,
    });

    return { success: true };
  },

  async approveJob(jobId: string, actorId: string, actorRole: string, universityId: string) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) throw ApiError.notFound('Job listing');

    const isSuperAdmin = actorRole === 'SUPER_ADMIN';
    if (!isSuperAdmin && job.reviewerId !== actorId) {
      throw ApiError.forbidden('You must claim this job before approving it.');
    }

    if (job.status !== 'UNDER_REVIEW' && !isSuperAdmin) {
      throw ApiError.conflict('Only jobs under active review can be approved.');
    }

    const now = new Date();
    const updated = await jobRepository.update(jobId, {
      status: 'PUBLISHED',
      publishedAt: now,
      approvedAt: now,
      reviewerId: actorId,
      approvedById: actorId,
      version: { increment: 1 },
    });

    await jobModerationRepository.createRecord({
      jobId,
      actorId,
      actorRole,
      action: 'APPROVE',
      ownerVisibleNote: 'Congratulations! Your job listing has been approved and published to the campus board.',
      internalNote: `Approved and published by ${actorRole} (${actorId}).`,
    });

    await cacheService.bumpVersion('jobs');

    await notificationService.notifyUser({
      userId: job.postedById,
      type: 'JOB_APPROVED',
      title: 'Job Opportunity Approved & Published',
      body: `Your job listing "${job.title}" at ${job.company} is now live on the campus job board!`,
      link: `/alumni/jobs/my-jobs`,
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'JOB_APPROVED',
      targetType: 'job',
      targetId: jobId,
      metadata: { actorRole },
    });

    return updated;
  },

  async rejectJob(
    jobId: string,
    actorId: string,
    actorRole: string,
    universityId: string,
    input: { reason: string; reasonCode?: string; internalNote?: string },
  ) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) throw ApiError.notFound('Job listing');

    const isSuperAdmin = actorRole === 'SUPER_ADMIN';
    if (!isSuperAdmin && job.reviewerId !== actorId) {
      throw ApiError.forbidden('You must claim this job before reviewing it.');
    }

    if (job.status !== 'UNDER_REVIEW' && !isSuperAdmin) {
      throw ApiError.conflict('Only jobs under active review can be rejected.');
    }

    const updated = await jobRepository.update(jobId, {
      status: 'REJECTED',
      rejectionReason: input.reason.trim(),
      reviewerId: actorId,
      version: { increment: 1 },
    });

    await jobModerationRepository.createRecord({
      jobId,
      actorId,
      actorRole,
      action: 'REJECT',
      reasonCode: input.reasonCode?.trim() || null,
      ownerVisibleNote: input.reason.trim(),
      internalNote: input.internalNote?.trim() || null,
    });

    await notificationService.notifyUser({
      userId: job.postedById,
      type: 'JOB_REJECTED',
      title: 'Job Submission Declined',
      body: `Your job listing "${job.title}" was declined: ${input.reason.trim()}`,
      link: `/alumni/jobs/my-jobs`,
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'JOB_REJECTED',
      targetType: 'job',
      targetId: jobId,
      metadata: { reason: input.reason, reasonCode: input.reasonCode },
    });

    return updated;
  },

  async requestChanges(
    jobId: string,
    actorId: string,
    actorRole: string,
    universityId: string,
    input: { notes: string; internalNote?: string },
  ) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) throw ApiError.notFound('Job listing');

    const isSuperAdmin = actorRole === 'SUPER_ADMIN';
    if (!isSuperAdmin && job.reviewerId !== actorId) {
      throw ApiError.forbidden('You must claim this job before requesting changes.');
    }

    if (job.status !== 'UNDER_REVIEW' && !isSuperAdmin) {
      throw ApiError.conflict('Only jobs under active review can have changes requested.');
    }

    const updated = await jobRepository.update(jobId, {
      status: 'CHANGES_REQUESTED',
      reviewerId: actorId,
      version: { increment: 1 },
    });

    await jobModerationRepository.createRecord({
      jobId,
      actorId,
      actorRole,
      action: 'REQUEST_CHANGES',
      ownerVisibleNote: input.notes.trim(),
      internalNote: input.internalNote?.trim() || null,
    });

    await notificationService.notifyUser({
      userId: job.postedById,
      type: 'JOB_CHANGES_REQUESTED',
      title: 'Action Required: Job Listing Revisions Needed',
      body: `Feedback received on "${job.title}": ${input.notes.trim()}. Please edit and resubmit.`,
      link: `/alumni/jobs/my-jobs`,
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'JOB_CHANGES_REQUESTED',
      targetType: 'job',
      targetId: jobId,
      metadata: { notes: input.notes },
    });

    return updated;
  },

  async adminOverride(
    jobId: string,
    superAdminId: string,
    universityId: string,
    input: {
      action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'UNPUBLISH' | 'CLOSE';
      reason: string;
      internalNote?: string;
    },
  ) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId) throw ApiError.notFound('Job listing');

    const previousReviewerId = job.reviewerId;
    let targetStatus: JobStatus;
    const now = new Date();
    const updateData: Parameters<typeof jobRepository.update>[1] = {
      reviewerId: superAdminId,
      version: { increment: 1 },
    };

    switch (input.action) {
      case 'APPROVE':
        targetStatus = 'PUBLISHED';
        updateData.publishedAt = now;
        updateData.approvedAt = now;
        break;
      case 'REJECT':
        targetStatus = 'REJECTED';
        updateData.rejectionReason = input.reason;
        break;
      case 'REQUEST_CHANGES':
        targetStatus = 'CHANGES_REQUESTED';
        break;
      case 'UNPUBLISH':
      case 'CLOSE':
        targetStatus = 'CLOSED';
        updateData.closedAt = now;
        updateData.closedById = superAdminId;
        updateData.closedReason = input.reason;
        break;
      default:
        throw ApiError.badRequest('Invalid override action');
    }

    updateData.status = targetStatus;
    const updated = await jobRepository.update(jobId, updateData);

    await jobModerationRepository.createRecord({
      jobId,
      actorId: superAdminId,
      actorRole: 'SUPER_ADMIN',
      action: 'OVERRIDE',
      ownerVisibleNote: `Administrator administrative update: ${input.reason}`,
      internalNote: `Super Admin Override (${input.action}). ${input.internalNote || ''}`,
      overrideOfReviewerId: previousReviewerId,
    });

    await cacheService.bumpVersion('jobs');

    // Notify previous reviewer if overturned
    if (previousReviewerId && previousReviewerId !== superAdminId) {
      await notificationService.notifyUser({
        userId: previousReviewerId,
        type: 'MODERATION_RESULT',
        title: 'Job Moderation Decision Overridden',
        body: `Super Admin has administratively updated job listing "${job.title}" to status ${targetStatus}.`,
        link: `/moderator/jobs`,
      });
    }

    // Notify job poster
    await notificationService.notifyUser({
      userId: job.postedById,
      type: 'MODERATION_RESULT',
      title: `Job Listing Status Updated: ${targetStatus}`,
      body: `Your job listing "${job.title}" status was administratively changed to ${targetStatus}: ${input.reason}`,
      link: `/alumni/jobs/my-jobs`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: superAdminId,
      action: 'JOB_MODERATION_OVERRIDDEN',
      targetType: 'job',
      targetId: jobId,
      metadata: {
        action: input.action,
        fromStatus: job.status,
        toStatus: targetStatus,
        previousReviewerId,
      },
    });

    return updated;
  },

  async getAdminJobs(
    universityId: string,
    filters: { status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const [jobs, total] = await jobRepository.listAdminJobs(universityId, filters, pagination);
    const formatted = jobs.map((j) => ({
      ...jobPresenter.toModerationDetail(j),
      applicationsCount: j._count?.applications ?? 0,
    }));
    return [formatted, total] as const;
  },
};
