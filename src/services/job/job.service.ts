import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { jobRepository } from '../../repositories/job.repository.js';
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
      action: 'job.created',
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
      action: `job.${input.status.toLowerCase()}`,
      targetType: 'job',
      targetId: reviewed.id,
      metadata: input.rejectionReason ? { rejectionReason: input.rejectionReason } : undefined,
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
        action: 'job.applied',
        targetType: 'job',
        targetId: input.jobId,
      });
      return application;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw ApiError.conflict('You have already applied for this job.');
      }
      throw error;
    }
  },
};
