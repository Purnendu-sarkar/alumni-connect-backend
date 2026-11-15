import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { jobRepository } from '../../repositories/job.repository.js';
import { notificationService } from '../notification/notification.service.js';
import type { PaginationInput } from '../../utils/pagination.js';

export const jobService = {
  listPublished(universityId: string, pagination: PaginationInput) {
    return jobRepository.listPublished(universityId, pagination);
  },

  async create(input: {
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
    const job = await jobRepository.create(input);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.postedById,
      action: 'JOB_CREATED',
      targetType: 'job',
      targetId: job.id,
    });
    return job;
  },

  async review(input: {
    jobId: string;
    universityId: string;
    reviewerId: string;
    status: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  }) {
    const job = await jobRepository.findById(input.jobId);
    if (!job || job.universityId !== input.universityId) throw ApiError.notFound('Job');
    if (job.status !== 'PENDING') throw ApiError.conflict('Only pending jobs can be reviewed.');

    const reviewed = await jobRepository.review(input);
    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.reviewerId,
      action: input.status === 'APPROVED' ? 'JOB_APPROVED' : 'JOB_REJECTED',
      targetType: 'job',
      targetId: reviewed.id,
      metadata: input.rejectionReason ? { rejectionReason: input.rejectionReason } : undefined,
    });

    await notificationService.notifyUser({
      userId: job.postedById,
      type: input.status === 'APPROVED' ? 'JOB_APPROVED' : 'JOB_REJECTED',
      title: input.status === 'APPROVED' ? 'Job Approved' : 'Job Submission Rejected',
      body:
        input.status === 'APPROVED'
          ? `Your job listing "${job.title}" has been approved and published.`
          : `Your job listing "${job.title}" was declined: ${input.rejectionReason || 'Does not meet posting guidelines'}.`,
      link: '/alumni/jobs',
    });

    return reviewed;
  },

  async apply(input: {
    jobId: string;
    universityId: string;
    applicantId: string;
    message?: string;
  }) {
    const job = await jobRepository.findById(input.jobId);
    if (!job || job.universityId !== input.universityId || job.status !== 'APPROVED') {
      throw ApiError.notFound('Open job');
    }
    if (job.expiresAt && job.expiresAt <= new Date())
      throw ApiError.conflict('This job has expired.');

    try {
      const application = await jobRepository.apply(input.jobId, input.applicantId, input.message);
      await auditLogRepository.record({
        universityId: input.universityId,
        actorId: input.applicantId,
        action: 'JOB_APPLICATION_SUBMITTED',
        targetType: 'job',
        targetId: input.jobId,
      });

      await notificationService.notifyUser({
        userId: job.postedById,
        type: 'APPLICATION_RECEIVED',
        title: 'New Job Application',
        body: `A new application was submitted for "${job.title}".`,
        link: '/alumni/jobs',
      });

      return application;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw ApiError.conflict('You have already applied for this job.');
      }
      throw error;
    }
  },

  listPending(universityId: string, pagination: PaginationInput) {
    return jobRepository.listPending(universityId, pagination);
  },

  async listMine(userId: string, role: string) {
    if (role === 'STUDENT') {
      const applications = await jobRepository.listMyApplications(userId);
      return { applications, postings: [] };
    }
    const postings = await jobRepository.listMyPosted(userId);
    return { postings, applications: [] };
  },

  getById(id: string) {
    return jobRepository.findById(id);
  },
};
