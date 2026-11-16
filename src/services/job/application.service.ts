import type { ApplicationStatus, Prisma } from '../../generated/prisma/client.js';

import { ApiError } from '../../errors/api-error.js';
import { applicationRepository } from '../../repositories/application.repository.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { jobRepository } from '../../repositories/job.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { notificationService } from '../notification/notification.service.js';
import { applicationPresenter } from '../../presenters/application.presenter.js';
import type { PaginationInput } from '../../utils/pagination.js';

export const applicationService = {
  async applyToJob(
    applicantId: string,
    universityId: string,
    jobId: string,
    input: {
      coverLetter?: string | null;
      message?: string | null;
      resumeKey?: string | null;
      shareProfileConsent?: boolean;
    },
  ) {
    const job = await jobRepository.findById(jobId);
    if (!job || job.universityId !== universityId || job.deletedAt) {
      throw ApiError.notFound('Job opportunity');
    }

    // 1. Anti-self-apply guard
    if (job.postedById === applicantId) {
      throw new ApiError(403, 'You cannot apply to your own job listing.', 'OWN_JOB');
    }

    // 2. Closed / Unpublished job check
    const isOpen = job.status === 'PUBLISHED' || job.status === 'APPROVED';
    if (!isOpen) {
      throw new ApiError(409, 'This job listing is not currently open for applications.', 'JOB_CLOSED');
    }

    // 3. Deadline check
    if (job.deadline < new Date()) {
      throw new ApiError(409, 'The application deadline for this position has passed.', 'JOB_CLOSED');
    }

    // 4. Duplicate check
    const existing = await applicationRepository.findByJobAndApplicant(jobId, applicantId);
    if (existing) {
      throw new ApiError(409, 'You have already submitted an application for this position.', 'DUPLICATE_APPLICATION');
    }

    // 5. Mandatory resume/cover letter checks
    const finalCoverLetter = input.coverLetter?.trim() || input.message?.trim() || null;
    if (job.requireResume && !input.resumeKey) {
      throw ApiError.badRequest('A PDF resume is required by the employer for this position.');
    }
    if (job.requireCoverLetter && !finalCoverLetter) {
      throw ApiError.badRequest('A cover letter statement is required by the employer for this position.');
    }

    // 6. Capture profile snapshot for employer record
    const applicantUser = await userRepository.findFullProfileById(applicantId);
    const profileSnapshot = applicantUser
      ? {
          name: applicantUser.name,
          email: applicantUser.email,
          phone: applicantUser.phonePublic ? applicantUser.phone : null,
          department: applicantUser.department,
          batch: applicantUser.batch,
          studentId: applicantUser.studentId,
          headline: applicantUser.headline,
          currentCompany: applicantUser.currentCompany,
          position: applicantUser.position,
          skills: applicantUser.skills,
          avatarUrl: applicantUser.avatarUrl,
        }
      : null;

    const application = await applicationRepository.create({
      jobId,
      applicantId,
      coverLetter: finalCoverLetter,
      message: finalCoverLetter,
      resumeKey: input.resumeKey?.trim() || null,
      shareProfileConsent: input.shareProfileConsent ?? true,
      profileSnapshot: profileSnapshot ? (profileSnapshot as Prisma.InputJsonValue) : undefined,
      status: 'APPLIED',
    });

    // Notify job poster
    await notificationService.notifyUser({
      userId: job.postedById,
      type: 'APPLICATION_RECEIVED',
      title: 'New Campus Application Received',
      body: `${applicantUser?.name || 'A candidate'} applied for your listing "${job.title}".`,
      link: `/alumni/applications/received?jobId=${job.id}`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: applicantId,
      action: 'JOB_APPLICATION_SUBMITTED',
      targetType: 'job',
      targetId: jobId,
      metadata: { applicationId: application.id, hasResume: Boolean(input.resumeKey) },
    });

    return application;
  },

  async getMyApplications(applicantId: string, pagination: PaginationInput) {
    const [apps, total] = await applicationRepository.listCandidateApplications(
      applicantId,
      pagination,
    );
    const formatted = apps.map((a) => applicationPresenter.toCandidateView(a));
    return [formatted, total] as const;
  },

  async getApplicationDetail(applicationId: string, userId: string, userRole: string) {
    const app = await applicationRepository.findById(applicationId);
    if (!app) throw ApiError.notFound('Application');

    const isApplicant = app.applicantId === userId;
    const isOwner = app.job?.postedById === userId;
    const isStaff = userRole === 'MODERATOR' || userRole === 'SUPER_ADMIN';

    if (!isApplicant && !isOwner && !isStaff) {
      throw ApiError.forbidden('You are not authorized to view this application.');
    }

    if (isOwner || isStaff) {
      return applicationPresenter.toOwnerCandidateView(app);
    }
    return applicationPresenter.toCandidateView(app);
  },

  async withdrawApplication(
    applicationId: string,
    applicantId: string,
    universityId: string,
    note?: string,
  ) {
    const app = await applicationRepository.findById(applicationId);
    if (!app) throw ApiError.notFound('Application');

    if (app.applicantId !== applicantId) {
      throw ApiError.forbidden('Only the candidate may withdraw their application.');
    }

    const withdrawableStatuses = ['APPLIED', 'UNDER_REVIEW', 'SHORTLISTED'];
    if (!withdrawableStatuses.includes(app.status)) {
      throw ApiError.conflict(
        `Cannot withdraw application with status "${app.status}". Only active candidacy may be withdrawn.`,
      );
    }

    const updated = await applicationRepository.withdrawApplication(
      applicationId,
      applicantId,
      note,
    );

    if (app.job?.postedById) {
      await notificationService.notifyUser({
        userId: app.job.postedById,
        type: 'APPLICATION_UPDATE',
        title: 'Candidacy Withdrawn',
        body: `A candidate withdrew their application for "${app.job.title}".`,
        link: `/alumni/applications/received?jobId=${app.jobId}`,
      });
    }

    await auditLogRepository.record({
      universityId,
      actorId: applicantId,
      action: 'APPLICATION_WITHDRAWN',
      targetType: 'job_application',
      targetId: applicationId,
    });

    return updated;
  },

  async getJobApplicationsForOwner(
    jobId: string,
    ownerId: string,
    filters: { status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const job = await jobRepository.findOwnerJobById(jobId, ownerId);
    if (!job) throw ApiError.notFound('Job listing');

    const [apps, total] = await applicationRepository.listApplicationsByJob(
      jobId,
      filters,
      pagination,
    );
    const formatted = apps.map((a) => applicationPresenter.toOwnerCandidateView(a));
    return [formatted, total] as const;
  },

  async getAllReceivedApplicationsForOwner(
    ownerId: string,
    filters: { jobId?: string; status?: string; q?: string },
    pagination: PaginationInput,
  ) {
    const [apps, total] = await applicationRepository.listAllReceivedApplicationsForOwner(
      ownerId,
      filters,
      pagination,
    );
    const formatted = apps.map((a) => applicationPresenter.toOwnerCandidateView(a));
    return [formatted, total] as const;
  },

  async updateApplicationStatus(
    jobId: string,
    applicationId: string,
    ownerId: string,
    universityId: string,
    toStatus: ApplicationStatus,
    ownerNote?: string | null,
  ) {
    const job = await jobRepository.findOwnerJobById(jobId, ownerId);
    if (!job) throw ApiError.notFound('Job listing');

    const app = await applicationRepository.findById(applicationId);
    if (!app || app.jobId !== jobId) {
      throw ApiError.notFound('Application');
    }

    if (app.status === 'WITHDRAWN') {
      throw ApiError.conflict('Cannot modify status of a withdrawn application.');
    }

    const updated = await applicationRepository.updateStatusWithHistory(
      applicationId,
      app.status,
      toStatus,
      ownerId,
      ownerNote,
    );

    // Notify candidate
    const statusTitles: Record<string, string> = {
      UNDER_REVIEW: 'Application Under Review',
      SHORTLISTED: 'Congratulations! You Have Been Shortlisted',
      ACCEPTED: 'Application Accepted',
      REJECTED: 'Application Status Update',
    };

    const statusBodies: Record<string, string> = {
      UNDER_REVIEW: `Your application for "${job.title}" at ${job.company} is currently under active review.`,
      SHORTLISTED: `Good news! Your candidacy for "${job.title}" at ${job.company} has been shortlisted.`,
      ACCEPTED: `Congratulations! Your application for "${job.title}" at ${job.company} was accepted.`,
      REJECTED: `Thank you for your interest in "${job.title}" at ${job.company}. The employer has decided to pursue other candidates at this time.`,
    };

    const applicantRole = (app.applicant as any)?.role?.name;
    const candidateLink = applicantRole === 'ALUMNI' ? '/alumni/applications' : '/student/applications';

    await notificationService.notifyUser({
      userId: app.applicantId,
      type: 'APPLICATION_UPDATE',
      title: statusTitles[toStatus] || 'Application Status Updated',
      body: statusBodies[toStatus] || `Your application status for "${job.title}" was updated to ${toStatus}.`,
      link: candidateLink,
    });

    await auditLogRepository.record({
      universityId,
      actorId: ownerId,
      action: 'APPLICATION_STATUS_CHANGED',
      targetType: 'job_application',
      targetId: applicationId,
      metadata: { fromStatus: app.status, toStatus, jobId },
    });

    return updated;
  },
};
