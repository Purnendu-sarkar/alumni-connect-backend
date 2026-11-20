import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runAutoPublishScheduledAnnouncements,
  runAutoArchiveExpiredAnnouncements,
  startAnnouncementLifecycleCron,
  stopAnnouncementLifecycleCron,
} from '../../src/jobs/announcement-lifecycle.cron.js';
import { prisma } from '../../src/config/database.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';
import { AnnouncementStatus } from '../../src/generated/prisma/client.js';

describe('Announcement Lifecycle & Scheduled-Publish Cron Scheduler Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task A: Auto-Publish Scheduled Announcements', () => {
    it('returns 0 when there are no scheduled draft announcements due for publication', async () => {
      vi.spyOn(prisma.announcement, 'findMany').mockResolvedValueOnce([]);

      const result = await runAutoPublishScheduledAnnouncements();

      expect(result).toBe(0);
      expect(prisma.announcement.findMany).toHaveBeenCalled();
    });

    it('transitions scheduled drafts to PUBLISHED, dispatches notifications according to audience, logs audits, and flushes cache', async () => {
      const mockScheduledDrafts = [
        {
          id: 'ann-1',
          title: 'Campus Central Library Orientation',
          audience: 'STUDENTS',
          category: 'ACADEMIC',
          universityId: 'uni-1',
          authorId: 'admin-1',
        },
        {
          id: 'ann-2',
          title: 'Global Alumni Mentorship Circular',
          audience: 'ALUMNI',
          category: 'CAREER',
          universityId: 'uni-1',
          authorId: 'admin-2',
        },
        {
          id: 'ann-3',
          title: 'Annual Convocation Announcement',
          audience: 'ALL',
          category: 'EVENT',
          universityId: 'uni-1',
          authorId: 'admin-1',
        },
      ];

      vi.spyOn(prisma.announcement, 'findMany').mockResolvedValueOnce(mockScheduledDrafts as any);
      vi.spyOn(prisma.announcement, 'updateMany').mockResolvedValue({ count: 1 });
      const notifySpy = vi.spyOn(notificationService, 'notifyRoles').mockResolvedValue([] as any);
      const auditSpy = vi.spyOn(prisma.auditLog, 'create').mockResolvedValue({} as any);
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(2);
      const delSpy = vi.spyOn(cacheService, 'delPattern').mockResolvedValue();

      const result = await runAutoPublishScheduledAnnouncements();

      expect(result).toBe(3);
      expect(prisma.announcement.updateMany).toHaveBeenCalledTimes(3);
      expect(notifySpy).toHaveBeenCalledTimes(3);

      // Verify role targeting per audience
      expect(notifySpy).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          roles: ['STUDENT'],
          type: 'ANNOUNCEMENT',
          link: '/announcements/ann-1',
        })
      );
      expect(notifySpy).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          roles: ['ALUMNI'],
          type: 'ANNOUNCEMENT',
          link: '/announcements/ann-2',
        })
      );
      expect(notifySpy).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          roles: ['STUDENT', 'ALUMNI'],
          type: 'ANNOUNCEMENT',
          link: '/announcements/ann-3',
        })
      );

      // Verify audit logs
      expect(auditSpy).toHaveBeenCalledTimes(3);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ANNOUNCEMENT_PUBLISHED',
            targetType: 'ANNOUNCEMENT',
            targetId: 'ann-1',
          }),
        })
      );

      // Verify cache invalidations
      expect(bumpSpy).toHaveBeenCalledWith('ann');
      expect(delSpy).toHaveBeenCalledWith('stats:*');
      expect(delSpy).toHaveBeenCalledWith('admin:*');
      expect(delSpy).toHaveBeenCalledWith('ann:*');
    });

    it('skips publication if another instance already claimed the draft announcement', async () => {
      const mockScheduledDrafts = [
        {
          id: 'ann-concurrent',
          title: 'Concurrent Notice',
          audience: 'ALL',
          category: 'GENERAL',
          universityId: 'uni-1',
          authorId: 'admin-1',
        },
      ];

      vi.spyOn(prisma.announcement, 'findMany').mockResolvedValueOnce(mockScheduledDrafts as any);
      // Simulate another worker claiming the lock first: count = 0
      vi.spyOn(prisma.announcement, 'updateMany').mockResolvedValueOnce({ count: 0 });
      const notifySpy = vi.spyOn(notificationService, 'notifyRoles');

      const result = await runAutoPublishScheduledAnnouncements();

      expect(result).toBe(0);
      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  describe('Task B: Auto-Archive Expired Announcements', () => {
    it('returns 0 when there are no published announcements past their archive deadline', async () => {
      vi.spyOn(prisma.announcement, 'findMany').mockResolvedValueOnce([]);

      const result = await runAutoArchiveExpiredAnnouncements();

      expect(result).toBe(0);
      expect(prisma.announcement.findMany).toHaveBeenCalled();
    });

    it('archives expired announcements, unpins them, writes audit logs, and flushes cache', async () => {
      const mockExpired = [
        {
          id: 'ann-exp-1',
          title: 'Old Job Fair Circular',
          universityId: 'uni-1',
          authorId: 'admin-1',
          pinned: true,
        },
        {
          id: 'ann-exp-2',
          title: 'Old Seminar Registration',
          universityId: 'uni-1',
          authorId: 'admin-2',
          pinned: false,
        },
      ];

      vi.spyOn(prisma.announcement, 'findMany').mockResolvedValueOnce(mockExpired as any);
      vi.spyOn(prisma.announcement, 'updateMany').mockResolvedValueOnce({ count: 2 });
      const auditSpy = vi.spyOn(prisma.auditLog, 'createMany').mockResolvedValueOnce({ count: 2 });
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValueOnce(3);
      const delSpy = vi.spyOn(cacheService, 'delPattern').mockResolvedValue();

      const result = await runAutoArchiveExpiredAnnouncements();

      expect(result).toBe(2);
      expect(prisma.announcement.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['ann-exp-1', 'ann-exp-2'] },
          status: AnnouncementStatus.PUBLISHED,
        },
        data: expect.objectContaining({
          status: AnnouncementStatus.ARCHIVED,
          pinned: false, // Ensures unpinned on archive!
        }),
      });

      expect(auditSpy).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'ANNOUNCEMENT_ARCHIVED',
            targetType: 'ANNOUNCEMENT',
            targetId: 'ann-exp-1',
          }),
          expect.objectContaining({
            action: 'ANNOUNCEMENT_ARCHIVED',
            targetType: 'ANNOUNCEMENT',
            targetId: 'ann-exp-2',
          }),
        ]),
      });

      expect(bumpSpy).toHaveBeenCalledWith('ann');
      expect(delSpy).toHaveBeenCalledWith('stats:*');
      expect(delSpy).toHaveBeenCalledWith('admin:*');
      expect(delSpy).toHaveBeenCalledWith('ann:*');
    });
  });

  describe('Scheduler Lifecycle in Test Environment', () => {
    it('safely skips starting background intervals when NODE_ENV is test', () => {
      expect(() => startAnnouncementLifecycleCron()).not.toThrow();
      expect(() => stopAnnouncementLifecycleCron()).not.toThrow();
    });
  });
});
