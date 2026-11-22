import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminService } from '../../src/services/admin/admin.service.js';
import { adminRepository } from '../../src/repositories/admin.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { broadcastNotificationSchema } from '../../src/validators/admin.schema.js';

describe('Analytics & System Broadcast Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'audit-log-1' } as never);
    vi.spyOn(cacheService, 'get').mockResolvedValue(null);
    vi.spyOn(cacheService, 'set').mockResolvedValue(undefined);
    vi.spyOn(cacheService, 'del').mockResolvedValue(undefined);
  });

  describe('broadcastNotificationSchema Validation', () => {
    it('accepts valid broadcast payloads', () => {
      const validPayload = {
        audience: 'ALL',
        category: 'ACADEMIC',
        title: 'Spring 2026 Convocation Registration Now Open',
        message: 'All graduating students and alumni are requested to complete registration before April 30.',
        link: '/events/convocation-2026',
      };

      const result = broadcastNotificationSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.audience).toBe('ALL');
        expect(result.data.category).toBe('ACADEMIC');
        expect(result.data.link).toBe('/events/convocation-2026');
      }
    });

    it('rejects external links to prevent open-redirect vulnerabilities', () => {
      const invalidPayload = {
        audience: 'STUDENTS',
        category: 'CAREER',
        title: 'Career Fair Notice',
        message: 'Visit external portal for career fair registrations.',
        link: 'https://malicious-external-site.com/phish',
      };

      const result = broadcastNotificationSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMessages = result.error.issues.map((i) => i.message);
        expect(errorMessages).toContain('Broadcast link must be a relative internal path starting with "/"');
      }
    });

    it('rejects title shorter than 5 characters or longer than 120 characters', () => {
      const shortTitle = {
        audience: 'ALUMNI',
        category: 'GENERAL',
        title: 'Hey',
        message: 'Valid message body here with enough length.',
      };

      const result = broadcastNotificationSchema.safeParse(shortTitle);
      expect(result.success).toBe(false);
    });

    it('rejects message shorter than 10 characters', () => {
      const shortMsg = {
        audience: 'MODERATORS',
        category: 'SECURITY_SYSTEM',
        title: 'Security Maintenance Notice',
        message: 'Short',
      };

      const result = broadcastNotificationSchema.safeParse(shortMsg);
      expect(result.success).toBe(false);
    });

    it('rejects invalid audience enum', () => {
      const invalidAudience = {
        audience: 'GUESTS',
        category: 'GENERAL',
        title: 'Valid Title Here',
        message: 'Valid message body with sufficient length.',
      };

      const result = broadcastNotificationSchema.safeParse(invalidAudience);
      expect(result.success).toBe(false);
    });
  });

  describe('adminService.broadcastNotification', () => {
    it('dispatches broadcast to all active users when audience is ALL', async () => {
      const mockUsers = [
        { id: 'user-stu-1' },
        { id: 'user-alu-1' },
        { id: 'user-mod-1' },
      ];

      const findActiveUsersSpy = vi
        .spyOn(adminRepository, 'findActiveUserIdsByRoles')
        .mockResolvedValue(mockUsers as never);
      const batchCreateSpy = vi
        .spyOn(adminRepository, 'createNotificationBatch')
        .mockResolvedValue({ count: 3 });
      const cacheDelSpy = vi.spyOn(cacheService, 'del').mockResolvedValue(undefined);
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'log-1' } as never);

      const result = await adminService.broadcastNotification({
        universityId: 'uni-123',
        actorId: 'admin-1',
        audience: 'ALL',
        category: 'CAREER',
        title: 'Annual Career Expo Announced',
        message: 'Join campus career expo with over 50 recruiting partners.',
        link: '/jobs/expo',
        ip: '127.0.0.1',
        userAgent: 'Vitest/Agent',
        requestId: 'req-test-1',
      });

      expect(findActiveUsersSpy).toHaveBeenCalledWith('uni-123', ['STUDENT', 'ALUMNI', 'MODERATOR']);
      expect(batchCreateSpy).toHaveBeenCalledTimes(1);
      expect(batchCreateSpy).toHaveBeenCalledWith([
        {
          userId: 'user-stu-1',
          type: 'SYSTEM_ANNOUNCEMENT',
          title: 'Annual Career Expo Announced',
          body: 'Join campus career expo with over 50 recruiting partners.',
          link: '/jobs/expo',
          metadata: {
            category: 'CAREER',
            audience: 'ALL',
            broadcastBy: 'admin-1',
          },
        },
        {
          userId: 'user-alu-1',
          type: 'SYSTEM_ANNOUNCEMENT',
          title: 'Annual Career Expo Announced',
          body: 'Join campus career expo with over 50 recruiting partners.',
          link: '/jobs/expo',
          metadata: {
            category: 'CAREER',
            audience: 'ALL',
            broadcastBy: 'admin-1',
          },
        },
        {
          userId: 'user-mod-1',
          type: 'SYSTEM_ANNOUNCEMENT',
          title: 'Annual Career Expo Announced',
          body: 'Join campus career expo with over 50 recruiting partners.',
          link: '/jobs/expo',
          metadata: {
            category: 'CAREER',
            audience: 'ALL',
            broadcastBy: 'admin-1',
          },
        },
      ]);

      expect(cacheDelSpy).toHaveBeenCalledWith('user:user-stu-1:notif_unread');
      expect(cacheDelSpy).toHaveBeenCalledWith('user:user-alu-1:notif_unread');
      expect(cacheDelSpy).toHaveBeenCalledWith('user:user-mod-1:notif_unread');

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          universityId: 'uni-123',
          actorId: 'admin-1',
          action: 'SYSTEM_BROADCAST_SENT',
          targetType: 'system',
          targetId: 'uni-123',
          metadata: {
            audience: 'ALL',
            category: 'CAREER',
            title: 'Annual Career Expo Announced',
            recipientCount: 3,
            link: '/jobs/expo',
          },
        }),
      );

      expect(result.recipientCount).toBe(3);
      expect(result.audience).toBe('ALL');
      expect(result.title).toBe('Annual Career Expo Announced');
      expect(result.sentAt).toBeDefined();
    });

    it('filters recipients by role when specific audience is targeted (STUDENTS)', async () => {
      const mockUsers = [{ id: 'user-stu-1' }];
      const findActiveUsersSpy = vi
        .spyOn(adminRepository, 'findActiveUserIdsByRoles')
        .mockResolvedValue(mockUsers as never);
      vi.spyOn(adminRepository, 'createNotificationBatch').mockResolvedValue({ count: 1 });

      const result = await adminService.broadcastNotification({
        universityId: 'uni-123',
        actorId: 'admin-1',
        audience: 'STUDENTS',
        category: 'ACADEMIC',
        title: 'Midterm Exam Schedule Released',
        message: 'Midterm schedules are now published on the student portal.',
      });

      expect(findActiveUsersSpy).toHaveBeenCalledWith('uni-123', ['STUDENT']);
      expect(result.recipientCount).toBe(1);
      expect(result.audience).toBe('STUDENTS');
    });

    it('chunks large recipient cohorts to prevent database packet overflow', async () => {
      // 600 recipients should be dispatched in 3 chunks (250, 250, 100)
      const mockUsers = Array.from({ length: 600 }, (_, idx) => ({ id: `user-${idx + 1}` }));
      vi.spyOn(adminRepository, 'findActiveUserIdsByRoles').mockResolvedValue(mockUsers as never);
      const batchCreateSpy = vi
        .spyOn(adminRepository, 'createNotificationBatch')
        .mockResolvedValue({ count: 250 });

      const result = await adminService.broadcastNotification({
        universityId: 'uni-123',
        actorId: 'admin-1',
        audience: 'ALL',
        category: 'SECURITY_SYSTEM',
        title: 'Critical Infrastructure Maintenance Window',
        message: 'Scheduled platform downtime tonight from 2:00 AM to 4:00 AM BST.',
      });

      expect(batchCreateSpy).toHaveBeenCalledTimes(3);
      expect(result.recipientCount).toBe(600);
    });
  });

  describe('adminService.getStats Caching', () => {
    it('returns cached stats directly when available in Redis', async () => {
      const cachedStats = {
        scope: 'SINGLE_UNIVERSITY',
        totalUsers: 2021,
        totalStudents: 1000,
        totalAlumni: 1000,
        cached: true,
      };

      const cacheGetSpy = vi.spyOn(cacheService, 'get').mockResolvedValue(cachedStats);
      const repoSpy = vi.spyOn(adminRepository, 'getDashboardStats');

      const result = await adminService.getStats('uni-nwu');

      expect(cacheGetSpy).toHaveBeenCalledWith('stats:admin:uni-nwu');
      expect(repoSpy).not.toHaveBeenCalled();
      expect(result).toEqual(cachedStats);
    });

    it('computes live stats and caches with 120s TTL on cache miss', async () => {
      const liveStats = {
        scope: 'SINGLE_UNIVERSITY' as const,
        totalUsers: 2021,
        totalStudents: 1010,
        totalAlumni: 1000,
        totalModerators: 10,
        totalAdmins: 1,
        approvedUsers: 2000,
        pendingVerifications: 15,
        emailVerifiedCount: 2010,
        adminVerifiedCount: 2005,
        rejectedVerificationCount: 6,
        suspendedUsers: 0,
        totalJobs: 45,
        pendingJobs: 3,
        closedJobs: 12,
        totalApplications: 120,
        shortlistedApplications: 25,
        acceptedApplications: 10,
        totalEvents: 18,
        upcomingEvents: 5,
        totalEventRsvps: 340,
        totalAnnouncements: 22,
        publishedStories: 30,
        openReports: 2,
        resolvedReports: 14,
        totalConnections: 520,
        acceptedConnections: 480,
        pendingConnections: 40,
        totalMentorships: 65,
        activeMentorships: 42,
        completedMentorships: 18,
        pendingMentorships: 5,
        auditLogsCount: 450,
        departmentBreakdown: [
          { departmentId: 'dep-1', code: 'CSE', name: 'Computer Science and Engineering', students: 200, alumni: 137, total: 337 },
        ],
      };

      vi.spyOn(cacheService, 'get').mockResolvedValue(null);
      const repoSpy = vi.spyOn(adminRepository, 'getDashboardStats').mockResolvedValue(liveStats as never);
      const cacheSetSpy = vi.spyOn(cacheService, 'set').mockResolvedValue(undefined);

      const result = await adminService.getStats('uni-nwu');

      expect(repoSpy).toHaveBeenCalledWith('uni-nwu');
      expect(cacheSetSpy).toHaveBeenCalledWith('stats:admin:uni-nwu', liveStats, 120);
      expect(result).toEqual(liveStats);
    });
  });

  describe('adminService.getBroadcastHistory', () => {
    it('returns formatted broadcast audit logs with parsed metadata', async () => {
      const mockAuditLogs = [
        {
          id: 'log-1',
          createdAt: new Date('2026-04-10T10:00:00.000Z'),
          actor: {
            name: 'Vice Chancellor Admin',
            email: 'admin@nwu.ac.bd',
          },
          metadata: {
            audience: 'STUDENTS',
            category: 'ACADEMIC',
            title: 'Convocation Final Call',
            recipientCount: 350,
            link: '/events/convocation',
          },
        },
      ];

      vi.spyOn(adminRepository, 'findRecentBroadcastAuditLogs').mockResolvedValue(mockAuditLogs as never);

      const history = await adminService.getBroadcastHistory('uni-nwu');

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        id: 'log-1',
        sentAt: '2026-04-10T10:00:00.000Z',
        senderName: 'Vice Chancellor Admin',
        senderEmail: 'admin@nwu.ac.bd',
        audience: 'STUDENTS',
        category: 'ACADEMIC',
        title: 'Convocation Final Call',
        recipientCount: 350,
        link: '/events/convocation',
      });
    });
  });
});
