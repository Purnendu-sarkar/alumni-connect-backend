import { describe, expect, it, vi, beforeEach } from 'vitest';
import { jobService } from '../../src/services/job/job.service.js';
import { jobRepository } from '../../src/repositories/job.repository.js';

describe('Security & Multi-Tenant Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cross-Tenant Job Review Isolation', () => {
    it('rejects an admin from University A attempting to review a job belonging to University B', async () => {
      // Job belongs to university-2
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-uni2',
        universityId: 'university-2',
        status: 'PENDING',
        title: 'Backend Intern',
      } as any);

      // Reviewer belongs to university-1
      await expect(
        jobService.review({
          jobId: 'job-uni2',
          universityId: 'university-1',
          reviewerId: 'admin-uni1',
          status: 'APPROVED',
        }),
      ).rejects.toThrow(/Job was not found/i);
    });
  });

  describe('Cross-Tenant Job Application Isolation', () => {
    it('rejects a student from University A attempting to apply for a job isolated to University B', async () => {
      vi.spyOn(jobRepository, 'findById').mockResolvedValue({
        id: 'job-uni2',
        universityId: 'university-2',
        status: 'APPROVED',
        expiresAt: null,
      } as any);

      // Student is in university-1
      await expect(
        jobService.apply({
          jobId: 'job-uni2',
          universityId: 'university-1',
          applicantId: 'student-uni1',
          message: 'Interested',
        }),
      ).rejects.toThrow(/Open job was not found/i);
    });
  });
});
