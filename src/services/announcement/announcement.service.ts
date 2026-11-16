import crypto from 'node:crypto';
import type {
  Prisma,
  AnnouncementCategory,
  AnnouncementStatus,
  AnnouncementAudience,
} from '../../generated/prisma/client.js';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import {
  announcementRepository,
  type AnnouncementFilterParams,
  type AdminAnnouncementFilterParams,
} from '../../repositories/announcement.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { announcementPresenter } from '../../presenters/announcement.presenter.js';
import { notificationService } from '../notification/notification.service.js';
import { sanitizeHtml } from '../../utils/html-sanitizer.js';
import { toPageMeta, type PaginationInput } from '../../utils/pagination.js';

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  category?: AnnouncementCategory;
  audience?: AnnouncementAudience;
  pinned?: boolean;
  publishAt?: Date | null;
  archiveAt?: Date | null;
  status?: AnnouncementStatus;
  notify?: boolean;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  category?: AnnouncementCategory;
  audience?: AnnouncementAudience;
  pinned?: boolean;
  publishAt?: Date | null;
  archiveAt?: Date | null;
  status?: AnnouncementStatus;
  notify?: boolean;
}

export const announcementService = {
  async listAnnouncements(
    userRole: string | undefined,
    filters: AnnouncementFilterParams,
    pagination: PaginationInput
  ) {
    const version = await cacheService.getVersion('ann');
    const queryHash = crypto
      .createHash('md5')
      .update(JSON.stringify(filters) + JSON.stringify(pagination))
      .digest('hex');
    const cacheKey = `ann:v${version}:${userRole || 'PUBLIC'}:${queryHash}`;

    interface CachedResult {
      announcements: any[];
      total: number;
    }

    let cached = await cacheService.get<CachedResult>(cacheKey);

    if (!cached) {
      const { announcements, total } = await announcementRepository.findManyPublished(
        userRole,
        filters,
        pagination
      );
      cached = { announcements, total };
      await cacheService.set(cacheKey, cached, 120);
    }

    const items = cached.announcements.map((a) =>
      announcementPresenter.toAnnouncementCard(a)
    );

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, cached.total),
    };
  },

  async getAnnouncementDetail(id: string, userRole?: string) {
    const announcement = await announcementRepository.findById(id);
    if (!announcement) {
      throw ApiError.notFound('Announcement');
    }

    if (
      announcement.status !== 'PUBLISHED' &&
      userRole !== 'SUPER_ADMIN' &&
      userRole !== 'MODERATOR'
    ) {
      throw ApiError.notFound('Announcement');
    }

    if (userRole !== 'SUPER_ADMIN' && userRole !== 'MODERATOR') {
      if (userRole === 'STUDENT' && announcement.audience === 'ALUMNI') {
        throw ApiError.forbidden('This announcement is intended for alumni only.');
      }
      if (userRole === 'ALUMNI' && announcement.audience === 'STUDENTS') {
        throw ApiError.forbidden('This announcement is intended for current students only.');
      }
      if (!userRole && announcement.audience !== 'ALL') {
        throw ApiError.unauthorized('Please sign in to view this announcement.');
      }
    }

    return announcementPresenter.toAnnouncementDetail(announcement as any, userRole);
  },

  // ================= ADMIN / MODERATOR METHODS =================

  async listAdminAnnouncements(
    filters: AdminAnnouncementFilterParams,
    pagination: PaginationInput
  ) {
    const { announcements, total } = await announcementRepository.findManyAdmin(
      filters,
      pagination
    );

    const items = announcements.map((a) =>
      announcementPresenter.toAdminAnnouncement(a as any)
    );

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    };
  },

  async getAdminAnnouncementDetail(id: string) {
    const announcement = await announcementRepository.findById(id);
    if (!announcement) {
      throw ApiError.notFound('Announcement');
    }
    return announcementPresenter.toAdminAnnouncement(announcement as any);
  },

  async createAnnouncement(adminUserId: string, data: CreateAnnouncementInput) {
    const sanitizedBody = sanitizeHtml(data.body);

    const user = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { universityId: true },
    });
    const universityId = user?.universityId || (await prisma.university.findFirst({ select: { id: true } }))?.id || '';

    if (data.pinned) {
      const activePinned = await announcementRepository.countActivePinned(undefined, universityId);
      if (activePinned >= 3) {
        throw new ApiError(
          409,
          'A maximum of 3 active pinned announcements is allowed. Unpin an existing announcement first.',
          'PINNED_LIMIT_EXCEEDED'
        );
      }
    }

    const isPublished = data.status === 'PUBLISHED';
    const publishedAt = isPublished ? new Date() : null;

    const announcement = await announcementRepository.create({
      title: data.title,
      body: sanitizedBody,
      category: data.category || 'GENERAL',
      audience: data.audience || 'ALL',
      pinned: data.pinned ?? false,
      publishAt: data.publishAt || null,
      archiveAt: data.archiveAt || null,
      status: data.status || 'DRAFT',
      publishedAt,
      university: { connect: { id: universityId } },
      author: { connect: { id: adminUserId } },
    });

    await cacheService.bumpVersion('ann');

    if (isPublished && data.notify !== false) {
      const targetRoles: Array<'STUDENT' | 'ALUMNI' | 'MODERATOR'> = [];
      if (announcement.audience === 'ALL') {
        targetRoles.push('STUDENT', 'ALUMNI');
      } else if (announcement.audience === 'STUDENTS') {
        targetRoles.push('STUDENT');
      } else if (announcement.audience === 'ALUMNI') {
        targetRoles.push('ALUMNI');
      }

      if (targetRoles.length > 0) {
        await notificationService.notifyRoles({
          roles: targetRoles,
          type: 'ANNOUNCEMENT',
          title: `Announcement: ${announcement.title}`,
          body: announcement.title,
          link: `/announcements/${announcement.id}`,
        });
      }
    }

    await auditLogRepository.record({
      universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_CREATED',
      targetType: 'ANNOUNCEMENT',
      targetId: announcement.id,
      metadata: { title: announcement.title, status: announcement.status },
    });

    return announcementPresenter.toAdminAnnouncement(announcement as any);
  },

  async updateAnnouncement(
    adminUserId: string,
    id: string,
    data: UpdateAnnouncementInput
  ) {
    const existing = await announcementRepository.findById(id);
    if (!existing) {
      throw ApiError.notFound('Announcement');
    }

    if (data.pinned && !existing.pinned) {
      const activePinned = await announcementRepository.countActivePinned(id, existing.universityId);
      if (activePinned >= 3) {
        throw new ApiError(
          409,
          'A maximum of 3 active pinned announcements is allowed. Unpin an existing announcement first.',
          'PINNED_LIMIT_EXCEEDED'
        );
      }
    }

    const updateData: Prisma.AnnouncementUpdateInput = {
      editedAt: new Date(),
      version: { increment: 1 },
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.body !== undefined) updateData.body = sanitizeHtml(data.body);
    if (data.category !== undefined) updateData.category = data.category;
    if (data.audience !== undefined) updateData.audience = data.audience;
    if (data.pinned !== undefined) updateData.pinned = data.pinned;
    if (data.publishAt !== undefined) updateData.publishAt = data.publishAt;
    if (data.archiveAt !== undefined) updateData.archiveAt = data.archiveAt;

    let newlyPublished = false;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
        updateData.publishedAt = new Date();
        newlyPublished = true;
      } else if (data.status === 'ARCHIVED' && existing.status !== 'ARCHIVED') {
        updateData.archivedAt = new Date();
        updateData.pinned = false;
      }
    }

    const updated = await announcementRepository.update(id, updateData);
    await cacheService.bumpVersion('ann');

    if (newlyPublished && data.notify !== false) {
      const targetRoles: Array<'STUDENT' | 'ALUMNI' | 'MODERATOR'> = [];
      if (updated.audience === 'ALL') {
        targetRoles.push('STUDENT', 'ALUMNI');
      } else if (updated.audience === 'STUDENTS') {
        targetRoles.push('STUDENT');
      } else if (updated.audience === 'ALUMNI') {
        targetRoles.push('ALUMNI');
      }

      if (targetRoles.length > 0) {
        await notificationService.notifyRoles({
          roles: targetRoles,
          type: 'ANNOUNCEMENT',
          title: `Announcement: ${updated.title}`,
          body: updated.title,
          link: `/announcements/${updated.id}`,
        });
      }
    }

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_UPDATED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { changes: Object.keys(data) },
    });

    return announcementPresenter.toAdminAnnouncement(updated as any);
  },

  async publishAnnouncement(adminUserId: string, id: string, notify = true) {
    const existing = await announcementRepository.findById(id);
    if (!existing) throw ApiError.notFound('Announcement');

    if (existing.status === 'PUBLISHED') {
      throw new ApiError(400, 'Announcement is already published', 'ALREADY_PUBLISHED');
    }

    const updated = await announcementRepository.update(id, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('ann');

    if (notify) {
      const targetRoles: Array<'STUDENT' | 'ALUMNI' | 'MODERATOR'> = [];
      if (updated.audience === 'ALL') {
        targetRoles.push('STUDENT', 'ALUMNI');
      } else if (updated.audience === 'STUDENTS') {
        targetRoles.push('STUDENT');
      } else if (updated.audience === 'ALUMNI') {
        targetRoles.push('ALUMNI');
      }

      if (targetRoles.length > 0) {
        await notificationService.notifyRoles({
          roles: targetRoles,
          type: 'ANNOUNCEMENT',
          title: `Announcement: ${updated.title}`,
          body: updated.title,
          link: `/announcements/${updated.id}`,
        });
      }
    }

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_PUBLISHED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { title: updated.title },
    });

    return announcementPresenter.toAdminAnnouncement(updated as any);
  },

  async archiveAnnouncement(adminUserId: string, id: string) {
    const existing = await announcementRepository.findById(id);
    if (!existing) throw ApiError.notFound('Announcement');

    const updated = await announcementRepository.update(id, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      pinned: false,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('ann');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_ARCHIVED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { title: updated.title },
    });

    return announcementPresenter.toAdminAnnouncement(updated as any);
  },

  async restoreAnnouncement(adminUserId: string, id: string) {
    const existing = await announcementRepository.findById(id);
    if (!existing) throw ApiError.notFound('Announcement');

    const updated = await announcementRepository.update(id, {
      status: 'DRAFT',
      archivedAt: null,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('ann');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_RESTORED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { title: updated.title },
    });

    return announcementPresenter.toAdminAnnouncement(updated as any);
  },

  async togglePin(adminUserId: string, id: string, pinned: boolean) {
    const existing = await announcementRepository.findById(id);
    if (!existing) throw ApiError.notFound('Announcement');

    if (pinned && !existing.pinned) {
      const activePinned = await announcementRepository.countActivePinned(id, existing.universityId);
      if (activePinned >= 3) {
        throw new ApiError(
          409,
          'A maximum of 3 active pinned announcements is allowed. Unpin an existing announcement first.',
          'PINNED_LIMIT_EXCEEDED'
        );
      }
    }

    const updated = await announcementRepository.update(id, {
      pinned,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('ann');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: pinned ? 'ANNOUNCEMENT_PINNED' : 'ANNOUNCEMENT_UNPINNED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { title: updated.title, pinned },
    });

    return announcementPresenter.toAdminAnnouncement(updated as any);
  },

  async duplicateAnnouncement(adminUserId: string, id: string) {
    const source = await announcementRepository.findById(id);
    if (!source) throw ApiError.notFound('Announcement');

    const duplicate = await announcementRepository.create({
      title: `Copy of ${source.title}`.slice(0, 120),
      body: source.body,
      category: source.category,
      audience: source.audience,
      pinned: false,
      status: 'DRAFT',
      university: { connect: { id: source.universityId } },
      author: { connect: { id: adminUserId } },
    });

    await cacheService.bumpVersion('ann');

    await auditLogRepository.record({
      universityId: source.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_DUPLICATED',
      targetType: 'ANNOUNCEMENT',
      targetId: duplicate.id,
      metadata: { sourceId: id, newTitle: duplicate.title },
    });

    return announcementPresenter.toAdminAnnouncement(duplicate as any);
  },

  async deleteAnnouncement(adminUserId: string, id: string) {
    const existing = await announcementRepository.findById(id);
    if (!existing) throw ApiError.notFound('Announcement');

    if (existing.status === 'PUBLISHED') {
      throw new ApiError(
        400,
        'Cannot delete a published announcement. Archive it first.',
        'DELETE_PUBLISHED_BLOCKED'
      );
    }

    await announcementRepository.softDelete(id);
    await cacheService.bumpVersion('ann');

    await auditLogRepository.record({
      universityId: existing.universityId,
      actorId: adminUserId,
      action: 'ANNOUNCEMENT_DELETED',
      targetType: 'ANNOUNCEMENT',
      targetId: id,
      metadata: { title: existing.title },
    });

    return { success: true };
  },
};
