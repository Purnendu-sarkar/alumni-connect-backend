import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/config/database.js';
import { reportService } from '../../src/services/report/report.service.js';
import { reportRepository } from '../../src/repositories/report.repository.js';
import { restrictionRepository } from '../../src/repositories/restriction.repository.js';
import { reportPresenter } from '../../src/presenters/report.presenter.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { notificationService } from '../../src/services/notification/notification.service.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { messageService } from '../../src/services/message/message.service.js';
import { jobService } from '../../src/services/job/job.service.js';
import { mentorshipService } from '../../src/services/mentorship/mentorship.service.js';
import { updateNotificationPreferencesSchema } from '../../src/validators/notification.schema.js';

describe('Feature 12 & 13: Reporting, Runtime Restrictions & Notification Controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Report Submission, Server Snapshots & Anti-Abuse Guards', () => {
    it('successfully submits a report for a Job target, capturing an immutable server snapshot', async () => {
      const mockJob = {
        id: 'job-101',
        title: 'Senior Software Engineer',
        company: 'Apex Tech',
        description: 'Exciting backend role.',
        requirements: 'Node.js, PostgreSQL',
        location: 'Khulna, Bangladesh',
        workMode: 'HYBRID',
        employmentType: 'FULL_TIME',
        salaryMin: 80000,
        salaryMax: 120000,
        salaryCurrency: 'BDT',
        status: 'PUBLISHED',
        postedById: 'alumni-author-1',
        postedBy: {
          id: 'alumni-author-1',
          name: 'Arif Gazi',
          email: 'arif@alumni.nwu.ac.bd',
        },
      };

      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue(mockJob as any);
      vi.spyOn(reportRepository, 'findOpenReportByTarget').mockResolvedValue(null);

      const createSpy = vi.spyOn(reportRepository, 'create').mockResolvedValue({
        id: 'report-1',
        universityId: 'uni-1',
        reportedById: 'student-reporter-1',
        reportedUserId: 'alumni-author-1',
        targetType: 'JOB',
        targetId: 'job-101',
        type: 'MISLEADING_JOB',
        reason: 'Suspicious Job - Details: Demanded advance fee',
        status: 'OPEN',
        snapshot: {
          jobId: 'job-101',
          title: 'Senior Software Engineer',
          company: 'Apex Tech',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      vi.spyOn(cacheService, 'delPattern').mockResolvedValue();

      const result = await reportService.submitReport({
        universityId: 'uni-1',
        reportedById: 'student-reporter-1',
        targetType: 'JOB',
        targetId: 'job-101',
        type: 'MISLEADING_JOB',
        reason: 'Suspicious Job',
        details: 'Demanded advance fee',
      });

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          universityId: 'uni-1',
          reportedById: 'student-reporter-1',
          reportedUserId: 'alumni-author-1',
          targetType: 'JOB',
          targetId: 'job-101',
          type: 'MISLEADING_JOB',
          snapshot: expect.objectContaining({
            jobId: 'job-101',
            title: 'Senior Software Engineer',
            company: 'Apex Tech',
          }),
        }),
      );
      expect(result).toHaveProperty('id', 'report-1');
      expect(result).toHaveProperty('status', 'OPEN');
    });

    it('rejects self-reporting with 422 CANNOT_REPORT_SELF', async () => {
      const mockUser = {
        id: 'user-self',
        name: 'Soumya Miah',
        email: 'soumya@nwu.ac.bd',
        role: { name: 'STUDENT' },
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser as any);

      await expect(
        reportService.submitReport({
          universityId: 'uni-1',
          reportedById: 'user-self',
          targetType: 'USER',
          targetId: 'user-self',
          type: 'HARASSMENT',
          reason: 'Testing self report prevention guard',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'CANNOT_REPORT_SELF',
      });
    });

    it('rejects duplicate open report on the same target with 409 DUPLICATE_REPORT', async () => {
      const mockUser = {
        id: 'target-user',
        name: 'Target Person',
        email: 'target@nwu.ac.bd',
        role: { name: 'STUDENT' },
      };

      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser as any);
      vi.spyOn(reportRepository, 'findOpenReportByTarget').mockResolvedValue({
        id: 'existing-open-report',
        status: 'OPEN',
      } as any);

      await expect(
        reportService.submitReport({
          universityId: 'uni-1',
          reportedById: 'reporter-1',
          targetType: 'USER',
          targetId: 'target-user',
          type: 'SPAM',
          reason: 'Spamming repeatedly',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_REPORT',
      });
    });
  });

  describe('2. Reporter Anonymity & Privacy Boundary', () => {
    const rawReport = {
      id: 'rep-anon-1',
      universityId: 'uni-1',
      targetType: 'USER',
      targetId: 'bad-actor-1',
      type: 'HARASSMENT',
      reason: 'Abusive language',
      status: 'OPEN',
      resolution: null,
      resolutionNote: null,
      snapshot: { name: 'Bad Actor' },
      claimedAt: null,
      escalatedAt: null,
      overturnedAt: null,
      overturnedById: null,
      overturnReason: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reportedById: 'secret-reporter-99',
      reportedBy: {
        id: 'secret-reporter-99',
        name: 'Vulnerable Student',
        email: 'vulnerable@nwu.ac.bd',
        role: { name: 'STUDENT' },
      },
      reportedUser: {
        id: 'bad-actor-1',
        name: 'Bad Actor',
        email: 'actor@nwu.ac.bd',
        role: { name: 'STUDENT' },
      },
    };

    it('masks reporter identity completely when the reported subject views the report DTO', () => {
      const response = reportPresenter.toReportResponse(rawReport, {
        viewerId: 'bad-actor-1',
        viewerRole: 'STUDENT',
      });

      expect(response.reportedBy).toBeNull();
      expect(response.reportedUser?.id).toBe('bad-actor-1');
    });

    it('exposes reporter details only to authorized MODERATOR and SUPER_ADMIN staff', () => {
      const modResponse = reportPresenter.toReportResponse(rawReport, {
        viewerId: 'mod-1',
        viewerRole: 'MODERATOR',
      });
      expect(modResponse.reportedBy).not.toBeNull();
      expect(modResponse.reportedBy?.id).toBe('secret-reporter-99');
      expect(modResponse.reportedBy?.name).toBe('Vulnerable Student');

      const adminResponse = reportPresenter.toReportResponse(rawReport, {
        viewerId: 'admin-1',
        viewerRole: 'SUPER_ADMIN',
      });
      expect(adminResponse.reportedBy).not.toBeNull();
      expect(adminResponse.reportedBy?.id).toBe('secret-reporter-99');
    });

    it('exposes reporter details when the reporter themselves views their own filed report', () => {
      const selfResponse = reportPresenter.toReportResponse(rawReport, {
        viewerId: 'secret-reporter-99',
        viewerRole: 'STUDENT',
      });
      expect(selfResponse.reportedBy).not.toBeNull();
      expect(selfResponse.reportedBy?.id).toBe('secret-reporter-99');
    });
  });

  describe('3. Moderator Sanctions & User Restrictions', () => {
    it('creates an active UserRestriction when moderator applies RESTRICT_USER sanction', async () => {
      const mockReport = {
        id: 'rep-resolve-1',
        universityId: 'uni-1',
        reportedById: 'rep-user-1',
        reportedUserId: 'offender-user-1',
        targetType: 'MESSAGE',
        targetId: 'msg-1',
        type: 'SPAM',
        status: 'UNDER_REVIEW',
        reviewerId: 'mod-1',
        snapshot: {},
        reason: 'Spamming message',
        resolution: null,
        resolutionNote: null,
        claimedAt: new Date(),
        escalatedAt: null,
        overturnedAt: null,
        overturnedById: null,
        overturnReason: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(reportRepository, 'findById').mockResolvedValue(mockReport as any);
      vi.spyOn(reportRepository, 'update').mockResolvedValue({
        ...mockReport,
        status: 'RESOLVED',
        resolution: 'RESTRICT_USER',
        resolutionNote: 'Messaging privileges restricted for 3 days due to spam.',
        resolvedAt: new Date(),
      } as any);

      vi.spyOn(reportRepository, 'createAction').mockResolvedValue({} as any);
      const restrictSpy = vi.spyOn(restrictionRepository, 'createRestriction').mockResolvedValue({
        id: 'restr-1',
        universityId: 'uni-1',
        userId: 'offender-user-1',
        type: 'MESSAGING',
        reason: 'Messaging privileges restricted for 3 days due to spam.',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        createdById: 'mod-1',
        sourceReportId: 'rep-resolve-1',
      } as any);

      vi.spyOn(cacheService, 'set').mockResolvedValue();
      vi.spyOn(cacheService, 'delPattern').mockResolvedValue();
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      const result = await reportService.resolveReport('rep-resolve-1', 'uni-1', 'mod-1', 'MODERATOR', {
        actionType: 'RESTRICT_USER',
        resolutionNote: 'Messaging privileges restricted for 3 days due to spam.',
        restrictionType: 'MESSAGING',
        durationDays: 3,
      });

      expect(restrictSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'offender-user-1',
          type: 'MESSAGING',
          createdById: 'mod-1',
          sourceReportId: 'rep-resolve-1',
        }),
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'offender-user-1',
          type: 'RESTRICTION_APPLIED',
        }),
      );
      expect(result).toHaveProperty('status', 'RESOLVED');
    });

    it('unpublishes Job and bumps Redis version when HIDE_CONTENT sanction is applied', async () => {
      const mockReport = {
        id: 'rep-hide-job',
        universityId: 'uni-1',
        reportedById: 'student-1',
        reportedUserId: 'alumni-1',
        targetType: 'JOB',
        targetId: 'job-to-hide',
        type: 'MISLEADING_JOB',
        status: 'UNDER_REVIEW',
        reviewerId: 'mod-1',
        snapshot: {},
        reason: 'Violation of recruitment rules',
        resolution: null,
        resolutionNote: null,
        claimedAt: new Date(),
        escalatedAt: null,
        overturnedAt: null,
        overturnedById: null,
        overturnReason: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(reportRepository, 'findById').mockResolvedValue(mockReport as any);
      vi.spyOn(reportRepository, 'update').mockResolvedValue({
        ...mockReport,
        status: 'RESOLVED',
        resolution: 'HIDE_CONTENT',
      } as any);
      vi.spyOn(reportRepository, 'createAction').mockResolvedValue({} as any);

      const jobUpdateSpy = vi.spyOn(prisma.job, 'updateMany').mockResolvedValue({ count: 1 } as any);
      const bumpVersionSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(2);
      vi.spyOn(cacheService, 'delPattern').mockResolvedValue();
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      await reportService.resolveReport('rep-hide-job', 'uni-1', 'mod-1', 'MODERATOR', {
        actionType: 'HIDE_CONTENT',
        resolutionNote: 'Job listing hidden due to violation of recruitment rules.',
      });

      expect(jobUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-to-hide', universityId: 'uni-1' },
          data: expect.objectContaining({ status: 'CLOSED' }),
        }),
      );
      expect(bumpVersionSpy).toHaveBeenCalledWith('jobs');
    });
  });

  describe('4. Runtime Restriction Enforcement in Domain Services', () => {
    it('blocks message sending with 403 USER_RESTRICTED when active MESSAGING restriction exists', async () => {
      const activeRestriction = {
        id: 'restr-msg-1',
        type: 'MESSAGING',
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };

      vi.spyOn(restrictionRepository, 'findActiveRestriction').mockResolvedValue(activeRestriction as any);

      await expect(
        messageService.sendMessage('conv-1', 'restricted-user', 'uni-1', {
          content: 'Hello, am I blocked?',
          type: 'TEXT',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_RESTRICTED',
      });
    });

    it('blocks job creation with 403 USER_RESTRICTED when active JOB_POSTING restriction exists', async () => {
      const activeRestriction = {
        id: 'restr-job-1',
        type: 'JOB_POSTING',
        endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      };

      vi.spyOn(restrictionRepository, 'findActiveRestriction').mockResolvedValue(activeRestriction as any);

      await expect(
        jobService.createJob('uni-1', 'restricted-alumni', {
          title: 'Staff Software Architect',
          description: 'Leading our core distributed services.',
          company: 'Acme Global',
          category: 'Software Engineering',
          location: 'Dhaka',
          workMode: 'REMOTE',
          deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_RESTRICTED',
      });
    });

    it('blocks mentorship request creation with 403 USER_RESTRICTED when active MENTORSHIP_REQUESTS restriction exists', async () => {
      const activeRestriction = {
        id: 'restr-mentor-1',
        type: 'MENTORSHIP_REQUESTS',
        endsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      };

      vi.spyOn(restrictionRepository, 'findActiveRestriction').mockResolvedValue(activeRestriction as any);

      await expect(
        mentorshipService.createRequest({
          universityId: 'uni-1',
          studentId: 'restricted-student',
          mentorId: 'alumni-mentor-1',
          topic: 'System Design',
          careerGoal: 'Cloud Architect',
          message: 'Can you please mentor me?',
          preferredCommunication: 'CHAT',
          availability: 'Flexible',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'USER_RESTRICTED',
      });
    });
  });

  describe('5. Super Admin Overturn Governance & Restriction Lift', () => {
    it('allows Super Admin to overturn a moderator decision and vacate associated penalties', async () => {
      const mockResolvedReport = {
        id: 'rep-to-overturn',
        universityId: 'uni-1',
        reportedById: 'reporter-1',
        reportedUserId: 'wrongly-penalized-user',
        reviewerId: 'mod-1',
        targetType: 'JOB',
        targetId: 'job-1',
        status: 'RESOLVED',
        resolution: 'RESTRICT_USER',
        snapshot: {},
        reason: 'False report',
        resolutionNote: 'Restricted by mistake',
        claimedAt: new Date(),
        escalatedAt: null,
        overturnedAt: null,
        overturnedById: null,
        overturnReason: null,
        resolvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(reportRepository, 'findById').mockResolvedValue(mockResolvedReport as any);
      vi.spyOn(reportRepository, 'update').mockResolvedValue({
        ...mockResolvedReport,
        status: 'RESOLVED',
        overturnedAt: new Date(),
        overturnedById: 'super-admin-1',
        overturnReason: 'False positive report. The employer credentials were verified by university.',
      } as any);

      vi.spyOn(reportRepository, 'createAction').mockResolvedValue({} as any);
      const revokeSpy = vi.spyOn(restrictionRepository, 'revokeBySourceReport').mockResolvedValue(1);
      vi.spyOn(prisma.job, 'updateMany').mockResolvedValue({ count: 1 } as any);
      vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(3);
      vi.spyOn(cacheService, 'delPattern').mockResolvedValue();
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      const result = await reportService.overturnReport(
        'rep-to-overturn',
        'uni-1',
        'super-admin-1',
        'False positive report. The employer credentials were verified by university.',
      );

      expect(revokeSpy).toHaveBeenCalledWith(
        'rep-to-overturn',
        'super-admin-1',
        'Overturned by Super Admin: False positive report. The employer credentials were verified by university.',
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'mod-1',
          type: 'MODERATION_RESULT',
        }),
      );
      expect(result).toHaveProperty('overturnedById', 'super-admin-1');
    });

    it('allows Super Admin to lift active restrictions early', async () => {
      const mockRestriction = {
        id: 'restr-lift-1',
        universityId: 'uni-1',
        userId: 'student-restricted',
        type: 'MESSAGING',
        revokedAt: null,
      };

      vi.spyOn(restrictionRepository, 'findById').mockResolvedValue(mockRestriction as any);
      vi.spyOn(restrictionRepository, 'revokeRestriction').mockResolvedValue({
        ...mockRestriction,
        revokedAt: new Date(),
        revokedById: 'super-admin-1',
        revokeReason: 'Good behavior appeal accepted by administration.',
      } as any);

      vi.spyOn(cacheService, 'del').mockResolvedValue();
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      const result = await reportService.liftRestriction(
        'restr-lift-1',
        'super-admin-1',
        'Good behavior appeal accepted by administration.',
      );

      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'student-restricted',
          type: 'RESTRICTION_ENDED',
        }),
      );
      expect(result).toHaveProperty('success', true);
    });
  });

  describe('6. Notification Preference Boundary Validation', () => {
    it('rejects attempt to disable inApp notifications on mandatory SECURITY_ALERT with validation error', () => {
      const invalidPayload = {
        preferences: [
          {
            type: 'SECURITY_ALERT',
            inApp: false, // Illegal attempt
            email: true,
          },
        ],
      };

      const result = updateNotificationPreferencesSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'Mandatory security and account notifications cannot be disabled',
        );
      }
    });

    it('rejects attempt to disable inApp notifications on mandatory RESTRICTION_APPLIED with validation error', () => {
      const invalidPayload = {
        preferences: [
          {
            type: 'RESTRICTION_APPLIED',
            inApp: false, // Illegal attempt
            email: false,
          },
        ],
      };

      const result = updateNotificationPreferencesSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          'Mandatory security and account notifications cannot be disabled',
        );
      }
    });

    it('accepts updating preferences for optional notification types like MENTORSHIP_REQUEST', () => {
      const validPayload = {
        preferences: [
          {
            type: 'MENTORSHIP_REQUEST',
            inApp: false,
            email: true,
          },
        ],
      };

      const result = updateNotificationPreferencesSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });
  });
});
