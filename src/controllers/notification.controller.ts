import { notificationService } from '../services/notification/notification.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const notificationController = {
  listNotifications: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const { page, limit, filter, type } = request.query as {
      page?: number;
      limit?: number;
      filter?: 'all' | 'unread';
      type?: any;
    };

    const result = await notificationService.getUserNotifications(userId, {
      page,
      limit,
      filter,
      type,
    });

    return sendSuccess(response, {
      data: result.notifications,
      meta: {
        ...result.meta,
        unreadCount: result.unreadCount,
      } as any,
    });
  }),

  getUnreadCount: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const result = await notificationService.getUnreadCount(userId);
    return sendSuccess(response, { data: result });
  }),

  markAsRead: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const id = request.params.id as string;
    await notificationService.markAsRead(id, userId);
    return sendSuccess(response, { message: 'Notification marked as read.' });
  }),

  markAllAsRead: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    await notificationService.markAllAsRead(userId);
    return sendSuccess(response, { message: 'All notifications marked as read.' });
  }),

  deleteNotification: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const id = request.params.id as string;
    await notificationService.deleteNotification(id, userId);
    return sendSuccess(response, { message: 'Notification removed.' });
  }),

  getPreferences: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const preferences = await notificationService.getPreferences(userId);
    return sendSuccess(response, { data: preferences });
  }),

  updatePreferences: asyncHandler(async (request, response) => {
    const userId = request.auth!.userId;
    const { preferences } = request.body;
    const result = await notificationService.updatePreferences(userId, preferences);
    return sendSuccess(response, {
      message: 'Notification preferences updated successfully.',
      data: result,
    });
  }),
};
