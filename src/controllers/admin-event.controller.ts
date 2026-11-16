import type { Request, Response } from 'express';
import type { z } from 'zod';

import { eventService } from '../services/event/event.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  adminEventQuerySchema,
  cancelEventSchema,
  createEventSchema,
  eventAttendeesQuerySchema,
  updateEventSchema,
} from '../validators/event.schema.js';

export const adminEventController = {
  list: asyncHandler(async (request: Request, response: Response) => {
    const query = request.query as unknown as z.infer<typeof adminEventQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const result = await eventService.listAdminEvents(
      {
        status: query.status,
        category: query.category,
        mode: query.mode,
        q: query.q,
      },
      { page, limit }
    );

    return sendSuccess(response, result);
  }),

  getById: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const event = await eventService.getAdminEventDetail(id as string);
    return sendSuccess(response, { data: event });
  }),

  create: asyncHandler(async (request: Request, response: Response) => {
    const body = request.body as z.infer<typeof createEventSchema>;
    const adminUserId = request.auth!.userId;

    const event = await eventService.createEvent(adminUserId, {
      title: body.title,
      description: body.description,
      category: body.category,
      organizer: body.organizer,
      mode: body.mode,
      venue: body.venue,
      onlineUrl: body.onlineUrl,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      rsvpDeadline: body.rsvpDeadline,
      capacity: body.capacity,
      waitlistEnabled: body.waitlistEnabled,
      bannerKey: body.bannerKey,
      reminderEnabled: body.reminderEnabled,
      status: body.status,
    });

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Event created successfully.',
      data: event,
    });
  }),

  update: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const body = request.body as z.infer<typeof updateEventSchema>;
    const adminUserId = request.auth!.userId;

    const event = await eventService.updateEvent(adminUserId, id as string, body);
    return sendSuccess(response, {
      message: 'Event updated successfully.',
      data: event,
    });
  }),

  publish: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const event = await eventService.publishEvent(adminUserId, id as string);
    return sendSuccess(response, {
      message: 'Event published successfully.',
      data: event,
    });
  }),

  cancel: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const { cancelReason } = request.body as z.infer<typeof cancelEventSchema>;
    const adminUserId = request.auth!.userId;

    const event = await eventService.cancelEvent(adminUserId, id as string, cancelReason);
    return sendSuccess(response, {
      message: 'Event has been cancelled and attendees notified.',
      data: event,
    });
  }),

  complete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const event = await eventService.completeEvent(adminUserId, id as string);
    return sendSuccess(response, {
      message: 'Event marked as completed.',
      data: event,
    });
  }),

  duplicate: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const event = await eventService.duplicateEvent(adminUserId, id as string);
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Event duplicated as draft.',
      data: event,
    });
  }),

  delete: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const adminUserId = request.auth!.userId;

    const result = await eventService.deleteEvent(adminUserId, id as string);
    return sendSuccess(response, {
      message: 'Event deleted successfully.',
      data: result,
    });
  }),

  getAttendees: asyncHandler(async (request: Request, response: Response) => {
    const { id } = request.params;
    const query = request.query as unknown as z.infer<typeof eventAttendeesQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const result = await eventService.getEventAttendees(
      id as string,
      query.status,
      { page, limit },
      query.q
    );

    return sendSuccess(response, result);
  }),
};
