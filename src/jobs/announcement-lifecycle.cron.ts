import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { env } from '../config/index.js';
import { cacheService } from '../services/cache/cache.service.js';
import { notificationService } from '../services/notification/notification.service.js';
import { AnnouncementStatus } from '../generated/prisma/client.js';

let publishInterval: NodeJS.Timeout | null = null;
let archiveInterval: NodeJS.Timeout | null = null;

let isPublishing = false;
let isArchiving = false;

/**
 * Task A: Auto-publish scheduled announcements whose publishAt date has arrived.
 * Transitions DRAFT announcements to PUBLISHED and dispatches role-scoped notifications.
 */
export async function runAutoPublishScheduledAnnouncements(): Promise<number> {
  if (isPublishing) {
    logger.debug('[ANNOUNCEMENT_CRON] Scheduled publish task already in progress. Skipping overlap.');
    return 0;
  }

  isPublishing = true;
  try {
    const now = new Date();

    // 1. Query pending draft announcements ready for automated publication
    const scheduledDrafts = await prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.DRAFT,
        deletedAt: null,
        publishAt: { lte: now },
      },
      select: {
        id: true,
        title: true,
        audience: true,
        category: true,
        universityId: true,
        authorId: true,
      },
    });

    if (scheduledDrafts.length === 0) {
      return 0;
    }

    let publishedCount = 0;

    for (const draft of scheduledDrafts) {
      // 2. Atomically transition to PUBLISHED to prevent duplicate multi-instance publishing
      const claimResult = await prisma.announcement.updateMany({
        where: {
          id: draft.id,
          status: AnnouncementStatus.DRAFT,
        },
        data: {
          status: AnnouncementStatus.PUBLISHED,
          publishedAt: now,
          version: { increment: 1 },
        },
      });

      if (claimResult.count === 0) {
        // Already published by a concurrent worker
        continue;
      }

      // 3. Dispatch targeted in-app notifications according to audience scope
      const targetRoles: Array<'STUDENT' | 'ALUMNI' | 'MODERATOR'> = [];
      if (draft.audience === 'ALL') {
        targetRoles.push('STUDENT', 'ALUMNI');
      } else if (draft.audience === 'STUDENTS') {
        targetRoles.push('STUDENT');
      } else if (draft.audience === 'ALUMNI') {
        targetRoles.push('ALUMNI');
      }

      if (targetRoles.length > 0) {
        await notificationService.notifyRoles({
          roles: targetRoles,
          universityId: draft.universityId,
          type: 'ANNOUNCEMENT',
          title: `Announcement: ${draft.title}`,
          body: draft.title,
          link: `/announcements/${draft.id}`,
          metadata: {
            announcementId: draft.id,
            category: draft.category,
            audience: draft.audience,
          },
        });
      }

      // 4. Record audit trail for publication
      await prisma.auditLog.create({
        data: {
          universityId: draft.universityId,
          actorId: draft.authorId,
          action: 'ANNOUNCEMENT_PUBLISHED',
          targetType: 'ANNOUNCEMENT',
          targetId: draft.id,
          metadata: {
            title: draft.title,
            autoPublished: true,
            publishedAt: now.toISOString(),
          },
        },
      });

      publishedCount++;
    }

    if (publishedCount > 0) {
      // 5. Invalidate distributed Redis caches
      await cacheService.bumpVersion('ann');
      await cacheService.delPattern('stats:*');
      await cacheService.delPattern('admin:*');
      await cacheService.delPattern('ann:*');

      logger.info(
        { count: publishedCount },
        '[ANNOUNCEMENT_CRON] Auto-published scheduled announcements successfully.'
      );
    }

    return publishedCount;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      '[ANNOUNCEMENT_CRON] Failed during auto-publishing of scheduled announcements.'
    );
    return 0;
  } finally {
    isPublishing = false;
  }
}

/**
 * Task B: Auto-archive published announcements whose archiveAt date has passed.
 * Transitions PUBLISHED announcements to ARCHIVED and releases any occupied pin slot.
 */
export async function runAutoArchiveExpiredAnnouncements(): Promise<number> {
  if (isArchiving) {
    logger.debug('[ANNOUNCEMENT_CRON] Auto-archive task already in progress. Skipping overlap.');
    return 0;
  }

  isArchiving = true;
  try {
    const now = new Date();

    // 1. Find all active published announcements whose archive deadline has elapsed
    const expiredAnnouncements = await prisma.announcement.findMany({
      where: {
        status: AnnouncementStatus.PUBLISHED,
        deletedAt: null,
        archiveAt: { lte: now },
      },
      select: {
        id: true,
        title: true,
        universityId: true,
        authorId: true,
        pinned: true,
      },
    });

    if (expiredAnnouncements.length === 0) {
      return 0;
    }

    const announcementIds = expiredAnnouncements.map((a) => a.id);

    // 2. Atomically transition them to ARCHIVED and unpin to free pin capacity
    const updateResult = await prisma.announcement.updateMany({
      where: {
        id: { in: announcementIds },
        status: AnnouncementStatus.PUBLISHED,
      },
      data: {
        status: AnnouncementStatus.ARCHIVED,
        archivedAt: now,
        pinned: false,
        version: { increment: 1 },
      },
    });

    if (updateResult.count > 0) {
      // 3. Record AuditLog entries for archival
      const auditData = expiredAnnouncements.map((a) => ({
        universityId: a.universityId,
        actorId: a.authorId,
        action: 'ANNOUNCEMENT_ARCHIVED',
        targetType: 'ANNOUNCEMENT',
        targetId: a.id,
        metadata: {
          title: a.title,
          autoArchived: true,
          archivedAt: now.toISOString(),
          wasPinned: a.pinned,
        },
      }));

      await prisma.auditLog.createMany({
        data: auditData,
      });

      // 4. Invalidate distributed Redis caches
      await cacheService.bumpVersion('ann');
      await cacheService.delPattern('stats:*');
      await cacheService.delPattern('admin:*');
      await cacheService.delPattern('ann:*');

      logger.info(
        { count: updateResult.count },
        '[ANNOUNCEMENT_CRON] Auto-archived expired announcements successfully.'
      );
    }

    return updateResult.count;
  } catch (error) {
    logger.error(
      { error: (error as Error).message },
      '[ANNOUNCEMENT_CRON] Failed during auto-archival of expired announcements.'
    );
    return 0;
  } finally {
    isArchiving = false;
  }
}

/**
 * Start background cron interval timers.
 * Skipped cleanly during unit tests (NODE_ENV === 'test').
 */
export function startAnnouncementLifecycleCron(): void {
  if (env.NODE_ENV === 'test') {
    logger.debug('[ANNOUNCEMENT_CRON] Background cron skipped in test environment.');
    return;
  }

  if (publishInterval || archiveInterval) {
    logger.warn('[ANNOUNCEMENT_CRON] Announcement lifecycle cron is already running.');
    return;
  }

  logger.info('[ANNOUNCEMENT_CRON] Initializing Announcement Lifecycle background scheduler...');

  // Auto-publish scheduled announcements every 10 minutes (600,000 ms)
  publishInterval = setInterval(() => {
    void runAutoPublishScheduledAnnouncements();
  }, 10 * 60 * 1000);

  // Auto-archive expired announcements every 15 minutes (900,000 ms)
  archiveInterval = setInterval(() => {
    void runAutoArchiveExpiredAnnouncements();
  }, 15 * 60 * 1000);

  // Run immediate non-blocking sweep on startup after a 5s delay
  setTimeout(() => {
    void runAutoPublishScheduledAnnouncements();
    void runAutoArchiveExpiredAnnouncements();
  }, 5000);

  logger.info('[ANNOUNCEMENT_CRON] Announcement Lifecycle scheduler active.');
}

/**
 * Stop background cron interval timers cleanly on server shutdown.
 */
export function stopAnnouncementLifecycleCron(): void {
  if (publishInterval) {
    clearInterval(publishInterval);
    publishInterval = null;
  }
  if (archiveInterval) {
    clearInterval(archiveInterval);
    archiveInterval = null;
  }
  logger.info('[ANNOUNCEMENT_CRON] Announcement Lifecycle background scheduler stopped.');
}
