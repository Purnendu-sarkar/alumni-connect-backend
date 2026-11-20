import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { env } from '../config/index.js';
import { cacheService } from '../services/cache/cache.service.js';
import { notificationService } from '../services/notification/notification.service.js';
import { EventStatus, RsvpStatus } from '../generated/prisma/client.js';

let completionInterval: NodeJS.Timeout | null = null;
let reminderInterval: NodeJS.Timeout | null = null;

let isCompleting = false;
let isReminding = false;

/**
 * Task A: Auto-complete published events whose end time has passed.
 * Runs periodically to transition past events to COMPLETED status.
 */
export async function runAutoCompleteExpiredEvents(): Promise<number> {
  if (isCompleting) {
    logger.debug('[EVENT_CRON] Auto-completion task already running. Skipping overlap.');
    return 0;
  }

  isCompleting = true;
  try {
    const now = new Date();

    // 1. Find all published events that have already ended
    const expiredEvents = await prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        deletedAt: null,
        endsAt: { lte: now },
      },
      select: {
        id: true,
        title: true,
        universityId: true,
        createdById: true,
      },
    });

    if (expiredEvents.length === 0) {
      return 0;
    }

    const eventIds = expiredEvents.map((e) => e.id);

    // 2. Atomically transition them to COMPLETED
    const updateResult = await prisma.event.updateMany({
      where: {
        id: { in: eventIds },
        status: EventStatus.PUBLISHED,
      },
      data: {
        status: EventStatus.COMPLETED,
        completedAt: now,
      },
    });

    // 3. Record AuditLog entries for completed events
    if (updateResult.count > 0) {
      const auditData = expiredEvents.map((e) => ({
        universityId: e.universityId,
        actorId: e.createdById,
        action: 'EVENT_COMPLETED',
        targetType: 'EVENT',
        targetId: e.id,
        metadata: {
          title: e.title,
          autoCompleted: true,
          completedAt: now.toISOString(),
        },
      }));

      await prisma.auditLog.createMany({
        data: auditData,
      });

      // 4. Invalidate Redis caches
      await cacheService.bumpVersion('events');
      await cacheService.delPattern('stats:*');
      await cacheService.delPattern('events:*');

      logger.info(
        { completedCount: updateResult.count },
        '[EVENT_CRON] Auto-completed expired events successfully.'
      );
    }

    return updateResult.count;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      '[EVENT_CRON] Failed during auto-completion of expired events.'
    );
    return 0;
  } finally {
    isCompleting = false;
  }
}

/**
 * Task B: Send 24-hour event reminders to confirmed attendees.
 * Finds published events starting in the next 24 hours that haven't sent reminders yet.
 */
export async function runSendEventReminders(): Promise<number> {
  if (isReminding) {
    logger.debug('[EVENT_CRON] Event reminder task already running. Skipping overlap.');
    return 0;
  }

  isReminding = true;
  try {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // 1. Find upcoming published events within 24h window needing reminder
    const upcomingEvents = await prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        deletedAt: null,
        reminderEnabled: true,
        reminderSentAt: null,
        startsAt: {
          gt: now,
          lte: twentyFourHoursFromNow,
        },
      },
      include: {
        rsvps: {
          where: { status: RsvpStatus.GOING },
          select: {
            user: {
              select: {
                id: true,
                role: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (upcomingEvents.length === 0) {
      return 0;
    }

    let dispatchedReminders = 0;

    for (const event of upcomingEvents) {
      // 2. Atomically mark reminderSentAt to prevent duplicate sends across instances
      const claimResult = await prisma.event.updateMany({
        where: {
          id: event.id,
          reminderSentAt: null,
        },
        data: {
          reminderSentAt: now,
        },
      });

      if (claimResult.count === 0) {
        // Already claimed by another process
        continue;
      }

      // 3. Dispatch in-app notifications to confirmed GOING attendees
      for (const rsvp of event.rsvps) {
        const user = rsvp.user;
        const roleName = user.role?.name;
        const rolePrefix =
          roleName === 'STUDENT'
            ? 'student'
            : roleName === 'ALUMNI'
            ? 'alumni'
            : roleName === 'SUPER_ADMIN'
            ? 'admin'
            : 'moderator';

        await notificationService.notifyUser({
          userId: user.id,
          type: 'EVENT_REMINDER',
          title: `Upcoming Event Reminder: ${event.title}`,
          body: `Reminder: "${event.title}" is scheduled to begin in less than 24 hours.`,
          link: `/${rolePrefix}/events/${event.id}`,
          metadata: {
            eventId: event.id,
            startsAt: event.startsAt.toISOString(),
          },
        });

        dispatchedReminders++;
      }
    }

    if (dispatchedReminders > 0) {
      logger.info(
        { eventsProcessed: upcomingEvents.length, remindersSent: dispatchedReminders },
        '[EVENT_CRON] Dispatched 24-hour event reminders successfully.'
      );
    }

    return dispatchedReminders;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      '[EVENT_CRON] Failed during event reminder dispatch.'
    );
    return 0;
  } finally {
    isReminding = false;
  }
}

/**
 * Start background cron interval timers.
 * Skipped cleanly during unit tests (NODE_ENV === 'test').
 */
export function startEventLifecycleCron(): void {
  if (env.NODE_ENV === 'test') {
    logger.debug('[EVENT_CRON] Background cron skipped in test environment.');
    return;
  }

  if (completionInterval || reminderInterval) {
    logger.warn('[EVENT_CRON] Event lifecycle cron is already running.');
    return;
  }

  logger.info('[EVENT_CRON] Initializing Event Lifecycle & Reminder background scheduler...');

  // Auto-complete expired events every 10 minutes (600,000 ms)
  completionInterval = setInterval(() => {
    void runAutoCompleteExpiredEvents();
  }, 10 * 60 * 1000);

  // Send 24-hour event reminders every 15 minutes (900,000 ms)
  reminderInterval = setInterval(() => {
    void runSendEventReminders();
  }, 15 * 60 * 1000);

  // Run immediate initial checks on startup
  setTimeout(() => {
    void runAutoCompleteExpiredEvents();
    void runSendEventReminders();
  }, 5000);

  logger.info('[EVENT_CRON] Event Lifecycle & Reminder scheduler active.');
}

/**
 * Stop background cron interval timers cleanly on server shutdown.
 */
export function stopEventLifecycleCron(): void {
  if (completionInterval) {
    clearInterval(completionInterval);
    completionInterval = null;
  }
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
  logger.info('[EVENT_CRON] Event Lifecycle background scheduler stopped.');
}
