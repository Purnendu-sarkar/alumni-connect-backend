import type { Request, Response } from 'express';
import type { z } from 'zod';

import { announcementService } from '../services/announcement/announcement.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type { announcementQuerySchema } from '../validators/announcement.schema.js';

export const announcementController = {
  list: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof announcementQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const userRole = request.auth?.role;

    const result = await announcementService.listAnnouncements(
      userRole,
      {
        category: query.category,
        q: query.q,
      },
      { page, limit }
    );

    return sendSuccess(response, result);
  }),

  getById: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userRole = request.auth?.role;

    const announcement = await announcementService.getAnnouncementDetail(
      id as string,
      userRole
    );

    return sendSuccess(response, { data: announcement });
  }),
};
