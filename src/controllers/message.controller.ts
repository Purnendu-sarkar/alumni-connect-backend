import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { messageService } from '../services/message/message.service.js';
import { messagePresenter } from '../presenters/message.presenter.js';
import {
  conversationPreferencesSchema,
  createConversationSchema,
  deleteMessageSchema,
  editMessageSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  reactMessageSchema,
  sendMessageSchema,
} from '../validators/message.validator.js';

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? '';
  return param ?? '';
}

export const messageController = {
  checkEligibility: asyncHandler(async (request: Request, response: Response) => {
    const targetUserId = getParam(request.params.targetUserId);
    const { userId, universityId } = request.auth!;

    const eligibility = await messageService.checkMessagingEligibility(
      userId,
      targetUserId,
      universityId,
    );

    return sendSuccess(response, {
      data: messagePresenter.formatEligibility(eligibility),
    });
  }),

  startOrGetConversation: asyncHandler(async (request: Request, response: Response) => {
    const input = createConversationSchema.parse(request.body);
    const { userId, universityId } = request.auth!;

    const conversation = await messageService.startOrGetConversation(
      universityId,
      userId,
      input,
    );

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Conversation initialized successfully',
      data: messagePresenter.formatConversation(conversation, userId),
    });
  }),

  listConversations: asyncHandler(async (request: Request, response: Response) => {
    const query = listConversationsQuerySchema.parse(request.query);
    const { userId, universityId } = request.auth!;

    const result = await messageService.getConversations(universityId, userId, query);

    return sendSuccess(response, {
      data: messagePresenter.formatConversationsList(result, userId),
    });
  }),

  getConversationById: asyncHandler(async (request: Request, response: Response) => {
    const id = getParam(request.params.id);
    const { userId } = request.auth!;

    const conversation = await messageService.getConversationById(id, userId);

    return sendSuccess(response, {
      data: messagePresenter.formatConversation(conversation, userId),
    });
  }),

  listMessages: asyncHandler(async (request: Request, response: Response) => {
    const id = getParam(request.params.id);
    const query = listMessagesQuerySchema.parse(request.query);
    const { userId } = request.auth!;

    const result = await messageService.getMessages(id, userId, query);

    return sendSuccess(response, {
      data: messagePresenter.formatMessagesList(result, userId),
    });
  }),

  sendMessage: asyncHandler(async (request: Request, response: Response) => {
    const id = getParam(request.params.id);
    const input = sendMessageSchema.parse(request.body);
    const { userId, universityId } = request.auth!;

    const message = await messageService.sendMessage(id, userId, universityId, input);

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Message sent successfully',
      data: messagePresenter.formatMessage(message, userId),
    });
  }),

  editMessage: asyncHandler(async (request: Request, response: Response) => {
    const messageId = getParam(request.params.messageId);
    const input = editMessageSchema.parse(request.body);
    const { userId } = request.auth!;

    const updated = await messageService.editMessage(messageId, userId, input.content);

    return sendSuccess(response, {
      message: 'Message updated successfully',
      data: messagePresenter.formatMessage(updated, userId),
    });
  }),

  deleteMessage: asyncHandler(async (request: Request, response: Response) => {
    const messageId = getParam(request.params.messageId);
    const input = deleteMessageSchema.parse(
      request.body && request.body.mode ? request.body : { mode: request.query.mode || 'ME' },
    );
    const { userId } = request.auth!;

    const result = await messageService.deleteMessage(messageId, userId, input.mode);

    return sendSuccess(response, {
      message: input.mode === 'EVERYONE' ? 'Message deleted for everyone' : 'Message deleted for you',
      data: result,
    });
  }),

  toggleReaction: asyncHandler(async (request: Request, response: Response) => {
    const messageId = getParam(request.params.messageId);
    const input = reactMessageSchema.parse(request.body);
    const { userId } = request.auth!;

    const updated = await messageService.toggleReaction(messageId, userId, input.emoji);

    return sendSuccess(response, {
      message: 'Reaction updated',
      data: { reactions: updated?.reactions },
    });
  }),

  markRead: asyncHandler(async (request: Request, response: Response) => {
    const id = getParam(request.params.id);
    const { userId } = request.auth!;

    await messageService.markConversationRead(id, userId);

    return sendSuccess(response, {
      message: 'Conversation marked as read',
      data: { success: true },
    });
  }),

  updatePreferences: asyncHandler(async (request: Request, response: Response) => {
    const id = getParam(request.params.id);
    const input = conversationPreferencesSchema.parse(request.body);
    const { userId } = request.auth!;

    const updated = await messageService.updateConversationPreferences(id, userId, input);

    return sendSuccess(response, {
      message: 'Conversation preferences updated',
      data: updated,
    });
  }),

  getUnreadCount: asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.auth!;

    const result = await messageService.getTotalUnreadCount(userId);

    return sendSuccess(response, {
      data: result,
    });
  }),
};
