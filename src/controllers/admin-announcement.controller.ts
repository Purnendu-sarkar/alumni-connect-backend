import type { Request, Response } from 'express';
import type { z } from 'zod';

import { announcementService } from '../services/announcement/announcement.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  adminAnnouncementQuerySchema,
  createAnnouncementSchema,
  togglePinSchema,
  updateAnnouncementSchema,
} from '../validators/announcement.schema.js';

export const adminAnnouncementController = {
  list: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof adminAnnouncementQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const result = await announcementService.listAdminAnnouncements(
      {
        status: query.status,
        category: query.category,
        audience: query.audience,
        q: query.q,
      },
      { page, limit }
    );

    return sendSuccess(response, result);
  }),

  getById: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const announcement = await announcementService.getAdminAnnouncementDetail(id as string);
    return sendSuccess(response, { data: announcement });
  }),

  create: asyncHandler(async (request: Request, response: Response) => {
    const body = request.body as z.infer<typeof createAnnouncementSchema>;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.createAnnouncement(adminUserId, {
      title: body.title,
      body: body.body,
      category: body.category,
      audience: body.audience,
      pinned: body.pinned,
      publishAt: body.publishAt,
      archiveAt: body.archiveAt,
      status: body.status,
      notify: body.notify,
    });

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Announcement created successfully.',
      data: announcement,
    });
  }),

  update: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const body = request.body as z.infer<typeof updateAnnouncementSchema>;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.updateAnnouncement(
      adminUserId,
      id as string,
      body
    );

    return sendSuccess(response, {
      message: 'Announcement updated successfully.',
      data: announcement,
    });
  }),

  publish: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;
    const notify = request.body.notify !== false;

    const announcement = await announcementService.publishAnnouncement(
      adminUserId,
      id as string,
      notify
    );

    return sendSuccess(response, {
      message: 'Announcement published successfully.',
      data: announcement,
    });
  }),

  archive: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.archiveAnnouncement(
      adminUserId,
      id as string
    );

    return sendSuccess(response, {
      message: 'Announcement archived successfully.',
      data: announcement,
    });
  }),

  restore: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.restoreAnnouncement(
      adminUserId,
      id as string
    );

    return sendSuccess(response, {
      message: 'Announcement restored to draft.',
      data: announcement,
    });
  }),

  togglePin: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const { pinned } = request.body as z.infer<typeof togglePinSchema>;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.togglePin(
      adminUserId,
      id as string,
      pinned
    );

    return sendSuccess(response, {
      message: pinned ? 'Announcement pinned.' : 'Announcement unpinned.',
      data: announcement,
    });
  }),

  duplicate: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const announcement = await announcementService.duplicateAnnouncement(
      adminUserId,
      id as string
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Announcement duplicated as draft.',
      data: announcement,
    });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const result = await announcementService.deleteAnnouncement(adminUserId, id as string);
    return sendSuccess(response, {
      message: 'Announcement deleted successfully.',
      data: result,
    });
  }),
};
