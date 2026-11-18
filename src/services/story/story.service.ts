import crypto from 'node:crypto';
import type { Prisma, StoryCategory, StoryStatus } from '../../generated/prisma/client.js';
import { config } from '../../config/index.js';
import { cloudinary } from '../../config/cloudinary.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { storyRepository, type StoryFilterParams } from '../../repositories/story.repository.js';
import { storyModerationRepository } from '../../repositories/story-moderation.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { storyPresenter, type StoryViewerContext } from '../../presenters/story.presenter.js';
import { notificationService } from '../notification/notification.service.js';
import { calculateReadingTime, sanitizeStoryHtml } from '../../utils/html-sanitizer.js';
import { toPageMeta, type PaginationInput } from '../../utils/pagination.js';

export interface CreateStoryServiceInput {
  title: string;
  summary: string;
  body: string;
  category?: StoryCategory;
  tags?: string[];
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  embeddedMediaPublicIds?: string[];
  submitNow?: boolean;
}

export interface UpdateStoryServiceInput {
  title?: string;
  summary?: string;
  body?: string;
  category?: StoryCategory;
  tags?: string[];
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  embeddedMediaPublicIds?: string[];
  submitNow?: boolean;
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
  const hash = crypto.randomBytes(3).toString('hex');
  return `${base || 'story'}-${hash}`;
}

async function destroyCloudinaryAsset(publicId: string) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Ignore Cloudinary deletion error
  }
}

export const storyService = {
  async listPublishedStories(
    universityId: string,
    filters: StoryFilterParams,
    pagination: PaginationInput,
    viewer?: StoryViewerContext
  ) {
    const version = await cacheService.getVersion('stories');
    const queryHash = crypto
      .createHash('md5')
      .update(JSON.stringify(filters) + JSON.stringify(pagination))
      .digest('hex');
    const cacheKey = `stories:v${version}:${universityId}:${queryHash}`;

    interface CachedResult {
      stories: any[];
      total: number;
    }

    let cached = await cacheService.get<CachedResult>(cacheKey);

    if (!cached) {
      const { stories, total } = await storyRepository.findManyPublished(
        universityId,
        filters,
        pagination
      );
      cached = { stories, total };
      await cacheService.set(cacheKey, cached, 120);
    }

    const items = cached.stories.map((story) => storyPresenter.toStoryCard(story, viewer));

    return {
      data: items,
      meta: toPageMeta(pagination.page, pagination.limit, cached.total),
    };
  },

  async getStoryDetail(idOrSlug: string, universityId: string, viewer?: StoryViewerContext) {
    let story = await storyRepository.findById(idOrSlug);
    if (!story) {
      story = await storyRepository.findBySlug(idOrSlug, universityId);
    }

    if (!story) {
      throw ApiError.notFound('Success Story');
    }

    // Story visibility rules
    if (story.status !== 'PUBLISHED') {
      const isAuthor = viewer?.userId === story.authorId;
      const isPrivileged = viewer?.role === 'SUPER_ADMIN' || viewer?.role === 'MODERATOR';

      if (!isAuthor && !isPrivileged) {
        throw ApiError.notFound('Success Story');
      }
    } else {
      // If author is suspended or inactive, hide published story from general viewers
      if (!story.author.isActive) {
        const isPrivileged = viewer?.role === 'SUPER_ADMIN' || viewer?.role === 'MODERATOR';
        if (!isPrivileged) {
          throw ApiError.notFound('Success Story');
        }
      }
    }

    return storyPresenter.toStoryDetail(story, viewer);
  },

  async getAuthorStories(
    authorId: string,
    universityId: string,
    statusFilter?: StoryStatus | 'ALL',
    pagination?: PaginationInput
  ) {
    const { stories, total } = await storyRepository.findManyByAuthor(
      authorId,
      universityId,
      statusFilter,
      pagination
    );

    const items = stories.map((s) => storyPresenter.toAuthorStoryDetail(s, { userId: authorId }));

    return {
      data: items,
      meta: toPageMeta(pagination?.page || 1, pagination?.limit || 20, total),
    };
  },

  async getAuthorStoryDetail(id: string, authorId: string) {
    const story = await storyRepository.findById(id);
    if (!story || story.authorId !== authorId) {
      throw ApiError.notFound('Success Story');
    }

    return storyPresenter.toAuthorStoryDetail(story, { userId: authorId });
  },

  async createStory(authorId: string, universityId: string, input: CreateStoryServiceInput) {
    const sanitizedBody = sanitizeStoryHtml(input.body, config.cloudinary.cloudName);
    const readingTime = calculateReadingTime(sanitizedBody);
    const slug = generateSlug(input.title);

    const initialStatus: StoryStatus = input.submitNow ? 'SUBMITTED' : 'DRAFT';

    const story = await storyRepository.create({
      university: { connect: { id: universityId } },
      author: { connect: { id: authorId } },
      title: input.title.trim(),
      slug,
      summary: input.summary.trim(),
      body: sanitizedBody,
      category: input.category || 'CAREER_MILESTONE',
      tags: input.tags || [],
      coverImageUrl: input.coverImageUrl || null,
      coverImagePublicId: input.coverImagePublicId || null,
      embeddedMediaPublicIds: input.embeddedMediaPublicIds || [],
      readingTimeMinutes: readingTime,
      status: initialStatus,
    });

    if (input.submitNow) {
      await storyModerationRepository.record({
        storyId: story.id,
        moderatorId: authorId,
        action: 'SUBMIT',
        note: 'Submitted for editorial review upon creation',
      });

      await auditLogRepository.record({
        universityId,
        actorId: authorId,
        action: 'STORY_SUBMITTED',
        targetType: 'SUCCESS_STORY',
        targetId: story.id,
        metadata: { title: story.title, category: story.category },
      });
    } else {
      await auditLogRepository.record({
        universityId,
        actorId: authorId,
        action: 'STORY_CREATED',
        targetType: 'SUCCESS_STORY',
        targetId: story.id,
        metadata: { title: story.title, status: 'DRAFT' },
      });
    }

    return storyPresenter.toAuthorStoryDetail(story, { userId: authorId });
  },

  async updateStory(
    id: string,
    authorId: string,
    universityId: string,
    input: UpdateStoryServiceInput
  ) {
    const existing = await storyRepository.findById(id);
    if (!existing || existing.authorId !== authorId) {
      throw ApiError.notFound('Success Story');
    }

    if (existing.status === 'UNDER_REVIEW') {
      throw new ApiError(
        409,
        'Cannot edit a story while it is currently under review by editorial staff.',
        'STORY_UNDER_REVIEW'
      );
    }

    const updateData: Prisma.SuccessStoryUpdateInput = {
      version: { increment: 1 },
    };

    let needsReReview = false;

    if (input.title !== undefined && input.title.trim() !== existing.title) {
      updateData.title = input.title.trim();
      needsReReview = true;
    }

    if (input.summary !== undefined && input.summary.trim() !== existing.summary) {
      updateData.summary = input.summary.trim();
      needsReReview = true;
    }

    if (input.body !== undefined) {
      const sanitized = sanitizeStoryHtml(input.body, config.cloudinary.cloudName);
      if (sanitized !== existing.body) {
        updateData.body = sanitized;
        updateData.readingTimeMinutes = calculateReadingTime(sanitized);
        needsReReview = true;
      }
    }

    if (input.category !== undefined) {
      updateData.category = input.category;
    }

    if (input.tags !== undefined) {
      updateData.tags = input.tags;
    }

    // Cover image replacement & cleanup
    if (input.coverImageUrl !== undefined) {
      updateData.coverImageUrl = input.coverImageUrl;
      if (input.coverImagePublicId !== undefined) {
        if (
          existing.coverImagePublicId &&
          existing.coverImagePublicId !== input.coverImagePublicId
        ) {
          await destroyCloudinaryAsset(existing.coverImagePublicId);
        }
        updateData.coverImagePublicId = input.coverImagePublicId;
      }
    }

    // Embedded media tracking & cleanup of removed assets
    if (input.embeddedMediaPublicIds !== undefined) {
      const existingMedia = existing.embeddedMediaPublicIds || [];
      const removedAssets = existingMedia.filter(
        (publicId) => !input.embeddedMediaPublicIds!.includes(publicId)
      );
      for (const assetId of removedAssets) {
        await destroyCloudinaryAsset(assetId);
      }
      updateData.embeddedMediaPublicIds = input.embeddedMediaPublicIds;
    }

    // Bait-and-Switch Guard: modifying published narrative sends it back to review
    if (existing.status === 'PUBLISHED' && needsReReview) {
      updateData.status = 'UNDER_REVIEW';
      updateData.claimedAt = null;
      updateData.reviewer = { disconnect: true };
      await cacheService.bumpVersion('stories');

      await storyModerationRepository.record({
        storyId: id,
        moderatorId: authorId,
        action: 'SUBMIT',
        note: 'Narrative modified after publication; resubmitted for editorial verification.',
      });

      await auditLogRepository.record({
        universityId,
        actorId: authorId,
        action: 'STORY_SUBMITTED',
        targetType: 'SUCCESS_STORY',
        targetId: id,
        metadata: { reason: 'BAIT_AND_SWITCH_PREVENTION' },
      });
    }

    if (input.submitNow) {
      updateData.status = 'SUBMITTED';
      updateData.ownerVisibleNote = null;
      updateData.claimedAt = null;
      updateData.reviewer = { disconnect: true };

      await storyModerationRepository.record({
        storyId: id,
        moderatorId: authorId,
        action: 'SUBMIT',
        note: 'Submitted for editorial review',
      });

      await auditLogRepository.record({
        universityId,
        actorId: authorId,
        action: 'STORY_SUBMITTED',
        targetType: 'SUCCESS_STORY',
        targetId: id,
        metadata: { title: existing.title },
      });
    }

    const updated = await storyRepository.update(id, updateData);

    return storyPresenter.toAuthorStoryDetail(updated, { userId: authorId });
  },

  async submitStory(id: string, authorId: string, universityId: string) {
    const existing = await storyRepository.findById(id);
    if (!existing || existing.authorId !== authorId) {
      throw ApiError.notFound('Success Story');
    }

    if (existing.status === 'PUBLISHED') {
      throw new ApiError(400, 'Story is already published.', 'ALREADY_PUBLISHED');
    }

    if (existing.status === 'SUBMITTED' || existing.status === 'UNDER_REVIEW') {
      throw new ApiError(409, 'Story is already undergoing editorial review.', 'ALREADY_SUBMITTED');
    }

    if (existing.title.length < 5) {
      throw new ApiError(400, 'Title must be at least 5 characters.', 'INVALID_TITLE');
    }

    if (existing.summary.length < 10) {
      throw new ApiError(400, 'Summary must be at least 10 characters.', 'INVALID_SUMMARY');
    }

    const updated = await storyRepository.update(id, {
      status: 'SUBMITTED',
      ownerVisibleNote: null,
      claimedAt: null,
      reviewer: { disconnect: true },
      version: { increment: 1 },
    });

    await storyModerationRepository.record({
      storyId: id,
      moderatorId: authorId,
      action: 'SUBMIT',
      note: 'Story submitted for review',
    });

    await auditLogRepository.record({
      universityId,
      actorId: authorId,
      action: 'STORY_SUBMITTED',
      targetType: 'SUCCESS_STORY',
      targetId: id,
      metadata: { title: updated.title },
    });

    return storyPresenter.toAuthorStoryDetail(updated, { userId: authorId });
  },

  async withdrawStory(id: string, authorId: string, universityId: string) {
    const existing = await storyRepository.findById(id);
    if (!existing || existing.authorId !== authorId) {
      throw ApiError.notFound('Success Story');
    }

    if (existing.status === 'UNDER_REVIEW') {
      throw new ApiError(
        409,
        'Story has already been claimed for review. Contact moderator to request changes.',
        'ALREADY_CLAIMED'
      );
    }

    if (existing.status !== 'SUBMITTED') {
      throw new ApiError(400, 'Only submitted stories can be withdrawn.', 'INVALID_STATE');
    }

    const updated = await storyRepository.update(id, {
      status: 'DRAFT',
      version: { increment: 1 },
    });

    await storyModerationRepository.record({
      storyId: id,
      moderatorId: authorId,
      action: 'WITHDRAW',
      note: 'Author withdrew submission to revise draft',
    });

    await auditLogRepository.record({
      universityId,
      actorId: authorId,
      action: 'STORY_WITHDRAWN',
      targetType: 'SUCCESS_STORY',
      targetId: id,
      metadata: { title: updated.title },
    });

    return storyPresenter.toAuthorStoryDetail(updated, { userId: authorId });
  },

  async unpublishStory(id: string, actorId: string, universityId: string, isSuperAdmin = false) {
    const existing = await storyRepository.findById(id);
    if (!existing) {
      throw ApiError.notFound('Success Story');
    }

    if (!isSuperAdmin && existing.authorId !== actorId) {
      throw ApiError.forbidden('Only the author or Super Admin can unpublish this story.');
    }

    if (existing.status !== 'PUBLISHED') {
      throw new ApiError(400, 'Only published stories can be unpublished.', 'INVALID_STATE');
    }

    const updated = await storyRepository.update(id, {
      status: 'UNPUBLISHED',
      version: { increment: 1 },
    });

    await cacheService.bumpVersion('stories');

    await storyModerationRepository.record({
      storyId: id,
      moderatorId: actorId,
      action: 'UNPUBLISH',
      note: isSuperAdmin ? 'Unpublished by administrator' : 'Unpublished by author',
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'STORY_UNPUBLISHED',
      targetType: 'SUCCESS_STORY',
      targetId: id,
      metadata: { title: updated.title },
    });

    return storyPresenter.toAuthorStoryDetail(updated, { userId: existing.authorId });
  },

  async deleteStory(id: string, authorId: string, universityId: string) {
    const existing = await storyRepository.findById(id);
    if (!existing || existing.authorId !== authorId) {
      throw ApiError.notFound('Success Story');
    }

    if (existing.status === 'PUBLISHED' || existing.status === 'UNDER_REVIEW') {
      throw new ApiError(
        400,
        'Cannot delete an active or published story. Unpublish it first.',
        'INVALID_STATE'
      );
    }

    // Clean up all Cloudinary assets
    if (existing.coverImagePublicId) {
      await destroyCloudinaryAsset(existing.coverImagePublicId);
    }
    for (const assetId of existing.embeddedMediaPublicIds || []) {
      await destroyCloudinaryAsset(assetId);
    }

    await storyRepository.softDelete(id);

    await auditLogRepository.record({
      universityId,
      actorId: authorId,
      action: 'STORY_DELETED',
      targetType: 'SUCCESS_STORY',
      targetId: id,
      metadata: { title: existing.title },
    });

    return { success: true };
  },
};
