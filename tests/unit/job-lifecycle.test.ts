import { describe, expect, it, vi, beforeEach } from 'vitest';
import { jobService } from '../../src/services/job/job.service.js';
import { applicationService } from '../../src/services/job/application.service.js';
import { jobRepository } from '../../src/repositories/job.repository.js';
import { applicationRepository } from '../../src/repositories/application.repository.js';
import { jobModerationRepository } from '../../src/repositories/job-moderation.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';

describe('Job Lifecycle & Applications Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(1);
    vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);
  });

  describe('Job Anti-Self-Apply Guard', () => {
    it('throws 403 OWN_JOB when a job author attempts to apply to their own listing', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-101',
        universityId: 'uni-1',
        postedById: 'alumni-author-1',
        status: 'PUBLISHED',
        deadline: new Date(Date.now() + 86400000),
        deletedAt: null,
      } as any);

      await expect(
        applicationService.applyToJob('alumni-author-1', 'uni-1', 'job-101', {
          coverLetter: 'Applying to my own job',
        }),
      ).rejects.toThrow(/cannot apply to your own job listing/i);
    });
  });

  describe('Duplicate Application Guard', () => {
    it('throws 409 DUPLICATE_APPLICATION when candidate already applied', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-101',
        universityId: 'uni-1',
        postedById: 'alumni-author-1',
        status: 'PUBLISHED',
        deadline: new Date(Date.now() + 86400000),
        deletedAt: null,
      } as any);

      vi.spyOn(applicationRepository, 'findByJobAndApplicant').mockResolvedValue({
        id: 'app-existing-1',
        status: 'APPLIED',
      } as any);

      await expect(
        applicationService.applyToJob('student-candidate-1', 'uni-1', 'job-101', {
          coverLetter: 'Second attempt',
        }),
      ).rejects.toThrow(/already submitted an application/i);
    });
  });

  describe('Closed Job Guard', () => {
    it('throws 409 JOB_CLOSED when applying to a job with CLOSED status', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-101',
        universityId: 'uni-1',
        postedById: 'alumni-author-1',
        status: 'CLOSED',
        deadline: new Date(Date.now() + 86400000),
        deletedAt: null,
      } as any);

      await expect(
        applicationService.applyToJob('student-candidate-1', 'uni-1', 'job-101', {
          coverLetter: 'Applying to closed job',
        }),
      ).rejects.toThrow(/not currently open for applications/i);
    });
  });

  describe('Critical Field Modification Re-Review Trigger', () => {
    it('automatically rolls back a PUBLISHED job to UNDER_REVIEW when critical fields are modified', async () => {
      vi.spyOn(jobRepository, 'findOwnerJobById').mockResolvedValue({
        id: 'job-published-1',
        universityId: 'uni-1',
        postedById: 'alumni-author-1',
        status: 'PUBLISHED',
        title: 'Original Backend Engineer',
        company: 'Original Tech Ltd',
        description: 'Original description',
        salaryMin: 50000,
        salaryMax: 80000,
      } as any);

      const updateSpy = vi.spyOn(jobRepository, 'update').mockResolvedValue({
        id: 'job-published-1',
        status: 'UNDER_REVIEW',
      } as any);

      const modRecordSpy = vi
        .spyOn(jobModerationRepository, 'createRecord')
        .mockResolvedValue({} as any);

      await jobService.updateJob('alumni-author-1', 'uni-1', 'job-published-1', {
        title: 'Tampered High-Paying Role',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'job-published-1',
        expect.objectContaining({
          status: 'UNDER_REVIEW',
        }),
      );
      expect(modRecordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBMIT',
          ownerVisibleNote: expect.stringMatching(/Reverted to moderation queue/i),
        }),
      );
    });
  });

  describe('Application Status Update Notification Routing', () => {
    it('dispatches notification with /student/applications when applicant is a student', async () => {
      vi.spyOn(jobRepository, 'findOwnerJobById').mockResolvedValue({
        id: 'job-1',
        title: 'Software Engineer',
        company: 'Tech Corp',
        postedById: 'owner-1',
      } as any);

      vi.spyOn(applicationRepository, 'findById').mockResolvedValue({
        id: 'app-1',
        jobId: 'job-1',
        applicantId: 'student-1',
        status: 'SUBMITTED',
        applicant: {
          id: 'student-1',
          role: { name: 'STUDENT' },
        },
      } as any);

      vi.spyOn(applicationRepository, 'updateStatusWithHistory').mockResolvedValue({} as any);

      const notifySpy = vi
        .spyOn(notificationService, 'notifyUser')
        .mockResolvedValue({} as any);

      await applicationService.updateApplicationStatus(
        'job-1',
        'app-1',
        'owner-1',
        'uni-1',
        'SHORTLISTED' as any,
      );

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'student-1',
          type: 'APPLICATION_UPDATE',
          link: '/student/applications',
        }),
      );
    });

    it('dispatches notification with /alumni/applications when applicant is an alumni', async () => {
      vi.spyOn(jobRepository, 'findOwnerJobById').mockResolvedValue({
        id: 'job-1',
        title: 'Senior Architect',
        company: 'Tech Corp',
        postedById: 'owner-1',
      } as any);

      vi.spyOn(applicationRepository, 'findById').mockResolvedValue({
        id: 'app-2',
        jobId: 'job-1',
        applicantId: 'alumni-applicant-1',
        status: 'SUBMITTED',
        applicant: {
          id: 'alumni-applicant-1',
          role: { name: 'ALUMNI' },
        },
      } as any);

      vi.spyOn(applicationRepository, 'updateStatusWithHistory').mockResolvedValue({} as any);

      const notifySpy = vi
        .spyOn(notificationService, 'notifyUser')
        .mockResolvedValue({} as any);

      await applicationService.updateApplicationStatus(
        'job-1',
        'app-2',
        'owner-1',
        'uni-1',
        'ACCEPTED' as any,
      );

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'alumni-applicant-1',
          type: 'APPLICATION_UPDATE',
          link: '/alumni/applications',
        }),
      );
    });
  });
});
