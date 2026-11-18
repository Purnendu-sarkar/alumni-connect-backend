import type { StoryStatus } from '../../generated/prisma/client.js';
import { cloudinary } from '../../config/cloudinary.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { storyRepository, type AdminStoryFilterParams } from '../../repositories/story.repository.js';
import { storyModerationRepository } from '../../repositories/story-moderation.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { storyPresenter, type StoryViewerContext } from '../../presenters/story.presenter.js';
import { notificationService } from '../notification/notification.service.js';
import { toPageMeta, type PaginationInput } from '../../utils/pagination.js';

async function destroyCloudinaryAsset(publicId: string) {
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result?.result === 'not found') {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    }
  } catch {
    // Ignore Cloudinary deletion error so DB transaction never fails
  }
}

function assertModerationEligibility(
  existing: { status: StoryStatus; reviewerId?: string | null },
  moderatorId: string,
  moderatorRole: string = 'MODERATOR'
) {
  if (existing.status !== 'SUBMITTED' && existing.status !== 'UNDER_REVIEW') {
    throw new ApiError(
      400,
      'Only submitted or under-review stories can be moderated.',
      'INVALID_STATE'
    );
  }

  if (
    existing.reviewerId &&
    existing.reviewerId !== moderatorId &&
    moderatorRole !== 'SUPER_ADMIN'
  ) {
    throw new ApiError(
      409,
      'This story is currently claimed by another reviewer.',
      'ALREADY_CLAIMED'
    );
  }
}

export const storyModerationService = {
  async listModerationStories(
    universityId: string,
    filters: AdminStoryFilterParams,
    pagination: PaginationInput,
    viewer?: StoryViewerContext
  ) {
    const { stories, total } = await storyRepository.findManyAdmin(
      universityId,
      filters,
      pagination
    );

    const items = stories.map((s) => storyPresenter.toAdminStoryDetail(s, viewer));

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, total),
    };
  },

  async getModerationStoryDetail(id: string, viewer?: StoryViewerContext) {
    const story = await storyRepository.findById(id);
    if (!story) {
      throw ApiError.notFound('Success Story');
    }

    return storyPresenter.toAdminStoryDetail(story, viewer);
  },

  async claimStory(storyId: string, universityId: string, moderatorId: string) {
    const result = await storyRepository.atomicClaim(storyId, universityId, moderatorId);

    if (result.count === 0) {
      throw new ApiError(
        409,
        'Story has already been claimed by another reviewer or is no longer pending review.',
        'ALREADY_CLAIMED'
      );
    }

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'CLAIM',
      note: 'Moderator claimed story for review',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_CLAIMED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
    });

    const updated = await storyRepository.findById(storyId);
    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: 'MODERATOR' });
  },

  async unclaimStory(storyId: string, universityId: string, moderatorId: string) {
    const result = await storyRepository.atomicUnclaim(storyId, universityId, moderatorId);

    if (result.count === 0) {
      throw new ApiError(
        400,
        'Story was not claimed by you or is no longer in review.',
        'NOT_CLAIMED_BY_YOU'
      );
    }

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'UNCLAIM',
      note: 'Moderator released story claim back to general review queue',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_UNCLAIMED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
    });

    const updated = await storyRepository.findById(storyId);
    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: 'MODERATOR' });
  },

  async approveStory(
    storyId: string,
    universityId: string,
    moderatorId: string,
    moderatorRole: string = 'MODERATOR'
  ) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    if (existing.status === 'PUBLISHED') {
      throw new ApiError(400, 'Story is already published.', 'ALREADY_PUBLISHED');
    }

    assertModerationEligibility(existing, moderatorId, moderatorRole);

    const updated = await storyRepository.update(storyId, {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ownerVisibleNote: null,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('stories');

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'APPROVE',
      note: 'Editorial review approved; story published to campus showcase',
    });

    await notificationService.notifyUser({
      userId: existing.authorId,
      type: 'STORY_REVIEW',
      title: 'Success Story Approved & Published!',
      body: `Congratulations! Your story "${existing.title}" has been approved and published to the alumni network.`,
      link: '/alumni/stories/my-stories',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_APPROVED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: updated.title },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: moderatorRole });
  },

  async rejectStory(
    storyId: string,
    universityId: string,
    moderatorId: string,
    reason: string,
    internalNote?: string,
    moderatorRole: string = 'MODERATOR'
  ) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    assertModerationEligibility(existing, moderatorId, moderatorRole);

    const updated = await storyRepository.update(storyId, {
      status: 'REJECTED',
      ownerVisibleNote: reason.trim(),
      internalNote: internalNote?.trim() || null,
      version: { increment: 1 },
    });

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'REJECT',
      note: reason.trim(),
    });

    await notificationService.notifyUser({
      userId: existing.authorId,
      type: 'STORY_REVIEW',
      title: 'Story Editorial Review Decision',
      body: `Your story "${existing.title}" was not approved: ${reason}`,
      link: '/alumni/stories/my-stories',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_REJECTED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: updated.title, reason },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: moderatorRole });
  },

  async requestChanges(
    storyId: string,
    universityId: string,
    moderatorId: string,
    notes: string,
    internalNote?: string,
    moderatorRole: string = 'MODERATOR'
  ) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    assertModerationEligibility(existing, moderatorId, moderatorRole);

    const updated = await storyRepository.update(storyId, {
      status: 'DRAFT',
      ownerVisibleNote: notes.trim(),
      internalNote: internalNote?.trim() || null,
      claimedAt: null,
      reviewer: { disconnect: true },
      version: { increment: 1 },
    });

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'REQUEST_CHANGES',
      note: notes.trim(),
    });

    await notificationService.notifyUser({
      userId: existing.authorId,
      type: 'STORY_REVIEW',
      title: 'Revisions Requested on Success Story',
      body: `The review team requested revisions on "${existing.title}": ${notes}`,
      link: '/alumni/stories/my-stories',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_CHANGES_REQUESTED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: updated.title, notes },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: moderatorRole });
  },

  async unpublishStoryByModerator(
    storyId: string,
    universityId: string,
    moderatorId: string,
    reason?: string
  ) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    if (existing.status !== 'PUBLISHED') {
      throw new ApiError(400, 'Only published stories can be unpublished.', 'INVALID_STATE');
    }

    const effectiveReason = reason?.trim() || 'Unpublished by editorial moderator';

    const updated = await storyRepository.update(storyId, {
      status: 'UNPUBLISHED',
      ownerVisibleNote: effectiveReason,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('stories');

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'UNPUBLISH',
      note: effectiveReason,
    });

    await notificationService.notifyUser({
      userId: existing.authorId,
      type: 'STORY_REVIEW',
      title: 'Success Story Unpublished',
      body: `Your story "${existing.title}" was unpublished by the editorial team: ${effectiveReason}`,
      link: '/alumni/stories/my-stories',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_UNPUBLISHED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: updated.title, reason: effectiveReason },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: 'MODERATOR' });
  },

  async restoreStory(storyId: string, universityId: string, moderatorId: string) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    if (existing.status !== 'UNPUBLISHED') {
      throw new ApiError(400, 'Only unpublished stories can be restored.', 'INVALID_STATE');
    }

    const updated = await storyRepository.update(storyId, {
      status: 'PUBLISHED',
      ownerVisibleNote: null,
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('stories');

    await storyModerationRepository.record({
      storyId,
      moderatorId,
      action: 'RESTORE',
      note: 'Story restored to published status by moderator',
    });

    await auditLogRepository.record({
      universityId,
      actorId: moderatorId,
      action: 'STORY_RESTORED',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: updated.title },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: moderatorId, role: 'MODERATOR' });
  },

  async adminOverride(
    storyId: string,
    universityId: string,
    adminId: string,
    status: StoryStatus,
    reason: string
  ) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    const updated = await storyRepository.update(storyId, {
      status,
      ...(status === 'PUBLISHED' ? { publishedAt: existing.publishedAt || new Date() } : {}),
      ownerVisibleNote: `Administrative override: ${reason.trim()}`,
      version: { increment: 1 },
    });

    if (status === 'PUBLISHED' || existing.status === 'PUBLISHED') {
      await cacheService.bumpVersion('stories');
    }

    await storyModerationRepository.record({
      storyId,
      moderatorId: adminId,
      action: 'ADMIN_OVERRIDE',
      note: `Admin override to ${status}: ${reason.trim()}`,
    });

    await auditLogRepository.record({
      universityId,
      actorId: adminId,
      action: 'STORY_ADMIN_OVERRIDE',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { fromStatus: existing.status, toStatus: status, reason },
    });

    return storyPresenter.toAdminStoryDetail(updated, { userId: adminId, role: 'SUPER_ADMIN' });
  },

  async deleteStoryByAdmin(storyId: string, universityId: string, adminId: string) {
    const existing = await storyRepository.findById(storyId);
    if (!existing) throw ApiError.notFound('Success Story');

    // Clean up Cloudinary assets
    if (existing.coverImagePublicId) {
      await destroyCloudinaryAsset(existing.coverImagePublicId);
    }
    for (const assetId of existing.embeddedMediaPublicIds || []) {
      await destroyCloudinaryAsset(assetId);
    }

    if (existing.status === 'PUBLISHED') {
      await cacheService.bumpVersion('stories');
    }

    await storyRepository.softDelete(storyId);

    await auditLogRepository.record({
      universityId,
      actorId: adminId,
      action: 'STORY_DELETED_BY_ADMIN',
      targetType: 'SUCCESS_STORY',
      targetId: storyId,
      metadata: { title: existing.title },
    });

    return { success: true };
  },
};
