import type { Request, Response } from 'express';
import type { z } from 'zod';

import { eventService } from '../services/event/event.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  eventQuerySchema,
  rsvpEventSchema,
} from '../validators/event.schema.js';
import { paginationQuerySchema } from '../utils/pagination.js';

export const eventController = {
  list: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof eventQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const viewer = request.auth
      ? { userId: request.auth.userId, role: request.auth.role }
      : undefined;

    const result = await eventService.listEvents(
      {
        tab: query.tab,
        category: query.category,
        mode: query.mode,
        q: query.q,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        sort: query.sort,
      },
      { page, limit },
      viewer
    );

    return sendSuccess(response, result);
  }),

  getById: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const viewer = request.auth
      ? { userId: request.auth.userId, role: request.auth.role }
      : undefined;

    const event = await eventService.getEventDetail(id as string, viewer);
    return sendSuccess(response, { data: event });
  }),

  getMyRsvps: asyncHandler(async (request: Request, response: Response) => {
    const query = paginationQuerySchema.parse(request.query);
    const userId = request.auth!.userId;

    const result = await eventService.getMyRsvps(userId, query);
    return sendSuccess(response, result);
  }),

  rsvp: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const { status } = request.body as z.infer<typeof rsvpEventSchema>;
    const userId = request.auth!.userId;

    const result = await eventService.rsvpToEvent(id as string, userId, status);
    const message =
      result.assignedStatus === 'WAITLISTED'
        ? 'Capacity reached. You have been placed on the priority waitlist.'
        : `Successfully updated RSVP status to ${result.assignedStatus}.`;

    return sendSuccess(response, {
      message,
      data: result,
    });
  }),

  cancelRsvp: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const userId = request.auth!.userId;

    const result = await eventService.cancelRsvp(id as string, userId);
    return sendSuccess(response, {
      message: 'RSVP has been cancelled successfully.',
      data: result,
    });
  }),
};
