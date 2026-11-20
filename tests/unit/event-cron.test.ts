import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runAutoCompleteExpiredEvents,
  runSendEventReminders,
  startEventLifecycleCron,
  stopEventLifecycleCron,
} from '../../src/jobs/event-lifecycle.cron.js';
import { prisma } from '../../src/config/database.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';
import { EventStatus, RsvpStatus } from '../../src/generated/prisma/client.js';

describe('Event Lifecycle & 24-Hour Reminder Cron Scheduler Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task A: Auto-Complete Expired Events', () => {
    it('returns 0 when there are no expired published events', async () => {
      vi.spyOn(prisma.event, 'findMany').mockResolvedValueOnce([]);

      const result = await runAutoCompleteExpiredEvents();

      expect(result).toBe(0);
      expect(prisma.event.findMany).toHaveBeenCalled();
    });

    it('auto-completes expired published events, creates audit logs, and invalidates cache', async () => {
      const mockExpiredEvents = [
        {
          id: 'event-101',
          title: 'Past Tech Colloquium',
          universityId: 'uni-1',
          createdById: 'admin-1',
        },
        {
          id: 'event-102',
          title: 'Past Career Seminar',
          universityId: 'uni-1',
          createdById: 'admin-2',
        },
      ];

      vi.spyOn(prisma.event, 'findMany').mockResolvedValueOnce(mockExpiredEvents as any);
      vi.spyOn(prisma.event, 'updateMany').mockResolvedValueOnce({ count: 2 });
      vi.spyOn(prisma.auditLog, 'createMany').mockResolvedValueOnce({ count: 2 });
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValueOnce(2);
      const delSpy = vi.spyOn(cacheService, 'delPattern').mockResolvedValue();

      const result = await runAutoCompleteExpiredEvents();

      expect(result).toBe(2);
      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['event-101', 'event-102'] },
          status: EventStatus.PUBLISHED,
        },
        data: expect.objectContaining({
          status: EventStatus.COMPLETED,
        }),
      });

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'EVENT_COMPLETED',
            targetType: 'EVENT',
            targetId: 'event-101',
          }),
          expect.objectContaining({
            action: 'EVENT_COMPLETED',
            targetType: 'EVENT',
            targetId: 'event-102',
          }),
        ]),
      });

      expect(bumpSpy).toHaveBeenCalledWith('events');
      expect(delSpy).toHaveBeenCalledWith('stats:*');
      expect(delSpy).toHaveBeenCalledWith('events:*');
    });
  });

  describe('Task B: 24-Hour Event Reminder Dispatch', () => {
    it('returns 0 when there are no upcoming events in 24h window needing reminder', async () => {
      vi.spyOn(prisma.event, 'findMany').mockResolvedValueOnce([]);

      const result = await runSendEventReminders();

      expect(result).toBe(0);
    });

    it('claims reminder lock atomically and dispatches notifications to confirmed GOING attendees', async () => {
      const mockUpcomingEvents = [
        {
          id: 'event-201',
          title: 'Annual Hackathon 2026',
          startsAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // starts in 12 hours
          rsvps: [
            {
              user: {
                id: 'student-1',
                role: { name: 'STUDENT' },
              },
            },
            {
              user: {
                id: 'alumni-1',
                role: { name: 'ALUMNI' },
              },
            },
          ],
        },
      ];

      vi.spyOn(prisma.event, 'findMany').mockResolvedValueOnce(mockUpcomingEvents as any);
      vi.spyOn(prisma.event, 'updateMany').mockResolvedValueOnce({ count: 1 });
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue({} as any);

      const result = await runSendEventReminders();

      expect(result).toBe(2); // 2 reminders dispatched

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'event-201',
          reminderSentAt: null,
        },
        data: expect.objectContaining({
          reminderSentAt: expect.any(Date),
        }),
      });

      expect(notifySpy).toHaveBeenCalledTimes(2);
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'student-1',
          type: 'EVENT_REMINDER',
          link: '/student/events/event-201',
        })
      );
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'alumni-1',
          type: 'EVENT_REMINDER',
          link: '/alumni/events/event-201',
        })
      );
    });

    it('skips dispatch if another instance already claimed reminderSentAt', async () => {
      const mockUpcomingEvents = [
        {
          id: 'event-202',
          title: 'Robotics Workshop',
          startsAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
          rsvps: [
            {
              user: {
                id: 'student-2',
                role: { name: 'STUDENT' },
              },
            },
          ],
        },
      ];

      vi.spyOn(prisma.event, 'findMany').mockResolvedValueOnce(mockUpcomingEvents as any);
      // Simulate another worker claiming the lock first: count = 0
      vi.spyOn(prisma.event, 'updateMany').mockResolvedValueOnce({ count: 0 });
      const notifySpy = vi.spyOn(notificationService, 'notifyUser');

      const result = await runSendEventReminders();

      expect(result).toBe(0);
      expect(notifySpy).not.toHaveBeenCalled();
    });
  });

  describe('Scheduler Lifecycle in Test Environment', () => {
    it('safely skips starting background intervals when NODE_ENV is test', () => {
      expect(() => startEventLifecycleCron()).not.toThrow();
      expect(() => stopEventLifecycleCron()).not.toThrow();
    });
  });
});
