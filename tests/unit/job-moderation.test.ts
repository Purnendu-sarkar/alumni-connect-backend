import { describe, expect, it, vi, beforeEach } from 'vitest';
import { jobModerationService } from '../../src/services/job/job-moderation.service.js';
import { jobRepository } from '../../src/repositories/job.repository.js';
import { jobModerationRepository } from '../../src/repositories/job-moderation.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';

describe('Job Moderation & Review Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(1);
    vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);
  });

  describe('Atomic Claim Concurrency Lock', () => {
    it('throws 409 ALREADY_CLAIMED when another moderator holds the active review lock', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-pending-1',
        universityId: 'uni-1',
        reviewerId: 'other-moderator-id',
        status: 'UNDER_REVIEW',
      } as any);

      await expect(
        jobModerationService.claimJob('job-pending-1', 'uni-1', 'mod-user-1'),
      ).rejects.toThrow(/already been claimed by another moderator/i);
    });

    it('successfully claims unassigned job and sets status to UNDER_REVIEW', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-pending-1',
        universityId: 'uni-1',
        reviewerId: null,
        status: 'SUBMITTED',
      } as any);

      vi.spyOn(jobRepository, 'atomicClaim').mockResolvedValue({
        id: 'job-pending-1',
        reviewerId: 'mod-user-1',
        status: 'UNDER_REVIEW',
      } as any);

      const recordSpy = vi
        .spyOn(jobModerationRepository, 'createRecord')
        .mockResolvedValue({} as any);

      const result = await jobModerationService.claimJob('job-pending-1', 'uni-1', 'mod-user-1');
      expect(result.success).toBe(true);
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLAIM',
          actorId: 'mod-user-1',
        }),
      );
    });
  });

  describe('Approval Workflow', () => {
    it('transitions job status to PUBLISHED and updates version', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-under-review-1',
        universityId: 'uni-1',
        postedById: 'alumni-1',
        title: 'Full Stack Engineer',
        reviewerId: 'mod-user-1',
        status: 'UNDER_REVIEW',
      } as any);

      const updateSpy = vi.spyOn(jobRepository, 'update').mockResolvedValue({
        id: 'job-under-review-1',
        status: 'PUBLISHED',
      } as any);

      const recordSpy = vi
        .spyOn(jobModerationRepository, 'createRecord')
        .mockResolvedValue({} as any);

      const notifySpy = vi
        .spyOn(notificationService, 'notifyUser')
        .mockResolvedValue({} as any);

      await jobModerationService.approveJob('job-under-review-1', 'mod-user-1', 'MODERATOR', 'uni-1');

      expect(updateSpy).toHaveBeenCalledWith(
        'job-under-review-1',
        expect.objectContaining({
          status: 'PUBLISHED',
        }),
      );
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPROVE',
        }),
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_APPROVED',
          link: '/alumni/jobs/my-jobs',
        }),
      );
    });
  });

  describe('Rejection Workflow', () => {
    it('transitions job status to REJECTED and records reasonCode and feedback', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-under-review-2',
        universityId: 'uni-1',
        postedById: 'alumni-2',
        title: 'Crypto Trader',
        reviewerId: 'mod-user-1',
        status: 'UNDER_REVIEW',
      } as any);

      const updateSpy = vi.spyOn(jobRepository, 'update').mockResolvedValue({
        id: 'job-under-review-2',
        status: 'REJECTED',
      } as any);

      const recordSpy = vi
        .spyOn(jobModerationRepository, 'createRecord')
        .mockResolvedValue({} as any);

      const notifySpy = vi
        .spyOn(notificationService, 'notifyUser')
        .mockResolvedValue({} as any);

      await jobModerationService.rejectJob(
        'job-under-review-2',
        'mod-user-1',
        'MODERATOR',
        'uni-1',
        {
          reason: 'Misleading employment promises and external telegram contact.',
          reasonCode: 'SCAM_OR_SUSPICIOUS',
          internalNote: 'Owner email domain does not match claimed company.',
        },
      );

      expect(updateSpy).toHaveBeenCalledWith(
        'job-under-review-2',
        expect.objectContaining({
          status: 'REJECTED',
        }),
      );
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REJECT',
          reasonCode: 'SCAM_OR_SUSPICIOUS',
        }),
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_REJECTED',
          link: '/alumni/jobs/my-jobs',
        }),
      );
    });
  });

  describe('Request Changes Workflow', () => {
    it('transitions job status to CHANGES_REQUESTED and notifies author', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-under-review-3',
        universityId: 'uni-1',
        postedById: 'alumni-3',
        title: 'Intern',
        reviewerId: 'mod-user-1',
        status: 'UNDER_REVIEW',
      } as any);

      const updateSpy = vi.spyOn(jobRepository, 'update').mockResolvedValue({
        id: 'job-under-review-3',
        status: 'CHANGES_REQUESTED',
      } as any);

      const recordSpy = vi
        .spyOn(jobModerationRepository, 'createRecord')
        .mockResolvedValue({} as any);

      const notifySpy = vi
        .spyOn(notificationService, 'notifyUser')
        .mockResolvedValue({} as any);

      await jobModerationService.requestChanges(
        'job-under-review-3',
        'mod-user-1',
        'MODERATOR',
        'uni-1',
        {
          notes: 'Please clarify the job location and required skills.',
          internalNote: 'Incomplete requirements section.',
        },
      );

      expect(updateSpy).toHaveBeenCalledWith(
        'job-under-review-3',
        expect.objectContaining({
          status: 'CHANGES_REQUESTED',
        }),
      );
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REQUEST_CHANGES',
        }),
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'JOB_CHANGES_REQUESTED',
          link: '/alumni/jobs/my-jobs',
        }),
      );
    });
  });
});
