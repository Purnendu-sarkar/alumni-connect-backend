import { blockService } from '../services/connection/block.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const blockController = {
  block: asyncHandler(async (request, response) => {
    const block = await blockService.blockUser({
      blockerId: request.auth!.userId,
      blockedId: request.body.blockedId,
      universityId: request.auth!.universityId,
      reason: request.body.reason,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      statusCode: 201,
      message: 'User blocked successfully.',
      data: block,
    });
  }),

  unblock: asyncHandler(async (request, response) => {
    await blockService.unblockUser({
      blockerId: request.auth!.userId,
      blockedId: request.params.userId as string,
      universityId: request.auth!.universityId,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'User unblocked successfully.',
    });
  }),

  listBlocked: asyncHandler(async (request, response) => {
    const blockedList = await blockService.listBlocked(request.auth!.userId);
    return sendSuccess(response, {
      data: blockedList,
    });
  }),
};
