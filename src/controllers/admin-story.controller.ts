import type { Request, Response } from 'express';
import type { z } from 'zod';
import { storyModerationService } from '../services/story/story-moderation.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  adminOverrideSchema,
  adminStoryQuerySchema,
  moderationDecisionSchema,
  requestChangesSchema,
} from '../validators/story.schema.js';

export const adminStoryController = {
  list: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof adminStoryQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const viewer = {
      userId: request.auth!.userId,
      role: request.auth!.role,
    };

    const universityId = request.auth!.universityId;

    const result = await storyModerationService.listModerationStories(
      universityId,
      {
        q: query.q,
        status: query.status,
        category: query.category,
        authorId: query.authorId,
      },
      { page, limit },
      viewer
    );

    return sendSuccess(response, result);
  }),

  getById: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const viewer = {
      userId: request.auth!.userId,
      role: request.auth!.role,
    };

    const story = await storyModerationService.getModerationStoryDetail(id as string, viewer);
    return sendSuccess(response, { data: story });
  }),

  claim: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyModerationService.claimStory(id as string, universityId, moderatorId);
    return sendSuccess(response, {
      message: 'Story successfully claimed for editorial review.',
      data: story,
    });
  }),

  unclaim: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyModerationService.unclaimStory(id as string, universityId, moderatorId);
    return sendSuccess(response, {
      message: 'Story released back to review queue.',
      data: story,
    });
  }),

  approve: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyModerationService.approveStory(id as string, universityId, moderatorId);
    return sendSuccess(response, {
      message: 'Story approved and published.',
      data: story,
    });
  }),

  reject: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const body = request.body as z.infer<typeof moderationDecisionSchema>;

    const story = await storyModerationService.rejectStory(
      id as string,
      universityId,
      moderatorId,
      body.reason,
      body.internalNote
    );

    return sendSuccess(response, {
      message: 'Story rejected.',
      data: story,
    });
  }),

  requestChanges: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const body = request.body as z.infer<typeof requestChangesSchema>;

    const story = await storyModerationService.requestChanges(
      id as string,
      universityId,
      moderatorId,
      body.notes,
      body.internalNote
    );

    return sendSuccess(response, {
      message: 'Revision requested from author.',
      data: story,
    });
  }),

  unpublish: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const reason = request.body.reason as string | undefined;

    const story = await storyModerationService.unpublishStoryByModerator(
      id as string,
      universityId,
      moderatorId,
      reason
    );

    return sendSuccess(response, {
      message: 'Story unpublished.',
      data: story,
    });
  }),

  restore: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const moderatorId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyModerationService.restoreStory(id as string, universityId, moderatorId);
    return sendSuccess(response, {
      message: 'Story restored to published status.',
      data: story,
    });
  }),

  override: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const body = request.body as z.infer<typeof adminOverrideSchema>;

    const story = await storyModerationService.adminOverride(
      id as string,
      universityId,
      adminId,
      body.status,
      body.reason
    );

    return sendSuccess(response, {
      message: `Story status administratively overridden to ${body.status}.`,
      data: story,
    });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    await storyModerationService.deleteStoryByAdmin(id as string, universityId, adminId);
    return sendSuccess(response, {
      message: 'Story permanently removed by administrator.',
    });
  }),
};
