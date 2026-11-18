import type { Request, Response } from 'express';
import type { z } from 'zod';
import { storyService } from '../services/story/story.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  createStorySchema,
  storyQuerySchema,
  updateStorySchema,
} from '../validators/story.schema.js';

export const storyController = {
  listPublished: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof storyQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 12, 1), 50);

    const viewer = request.auth
      ? { userId: request.auth.userId, role: request.auth.role }
      : undefined;

    const universityId = request.auth?.universityId || (request as any).university?.id || '';

    const result = await storyService.listPublishedStories(
      universityId,
      {
        q: query.q,
        category: query.category,
        department: query.department,
        graduationYear: query.graduationYear ? Number(query.graduationYear) : undefined,
        sort: query.sort,
      },
      { page, limit },
      viewer
    );

    return sendSuccess(response, result);
  }),

  getDetail: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const viewer = request.auth
      ? { userId: request.auth.userId, role: request.auth.role }
      : undefined;

    const universityId = request.auth?.universityId || (request as any).university?.id || '';

    const story = await storyService.getStoryDetail(id as string, universityId, viewer);
    return sendSuccess(response, { data: story });
  }),

  listMine: asyncHandler(async (request: Request, response: Response) => {
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const statusFilter = request.query.status as any;
    const page = Math.max(Number(request.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(request.query.limit) || 20, 1), 50);

    const result = await storyService.getAuthorStories(userId, universityId, statusFilter, {
      page,
      limit,
    });

    return sendSuccess(response, result);
  }),

  getMineDetail: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;

    const story = await storyService.getAuthorStoryDetail(id as string, userId);
    return sendSuccess(response, { data: story });
  }),

  create: asyncHandler(async (request: Request, response: Response) => {
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const body = request.body as z.infer<typeof createStorySchema>;

    const story = await storyService.createStory(userId, universityId, body);
    return sendSuccess(response, {
      statusCode: 201,
      message: body.submitNow
        ? 'Story submitted for editorial review.'
        : 'Story draft saved successfully.',
      data: story,
    });
  }),

  update: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const body = request.body as z.infer<typeof updateStorySchema>;

    const story = await storyService.updateStory(id as string, userId, universityId, body);
    return sendSuccess(response, {
      message: body.submitNow
        ? 'Story submitted for review.'
        : 'Story updated successfully.',
      data: story,
    });
  }),

  submit: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyService.submitStory(id as string, userId, universityId);
    return sendSuccess(response, {
      message: 'Story successfully submitted for editorial review.',
      data: story,
    });
  }),

  withdraw: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    const story = await storyService.withdrawStory(id as string, userId, universityId);
    return sendSuccess(response, {
      message: 'Story withdrawn back to draft status.',
      data: story,
    });
  }),

  unpublish: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;
    const isSuperAdmin = request.auth?.role === 'SUPER_ADMIN';

    const story = await storyService.unpublishStory(id as string, userId, universityId, isSuperAdmin);
    return sendSuccess(response, {
      message: 'Story unpublished from the showcase.',
      data: story,
    });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;
    const universityId = request.auth!.universityId;

    await storyService.deleteStory(id as string, userId, universityId);
    return sendSuccess(response, {
      message: 'Story deleted successfully.',
    });
  }),
};
