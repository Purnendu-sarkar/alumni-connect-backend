import { blockService } from '../services/connection/block.service.js';
import { connectionService } from '../services/connection/connection.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import type {
  connectionQuerySchema,
  createConnectionSchema,
  respondConnectionSchema,
} from '../validators/connection.schema.js';
import type { z } from 'zod';

type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
type RespondConnectionInput = z.infer<typeof respondConnectionSchema>;
type ConnectionQuery = z.infer<typeof connectionQuerySchema>;

export const connectionController = {
  create: asyncHandler(async (request, response) => {
    const body = request.body as CreateConnectionInput;
    const connection = await connectionService.create({
      universityId: request.auth!.universityId,
      requesterId: request.auth!.userId,
      ...body,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    const isAutoAccepted = connection.status === 'ACCEPTED';
    return sendSuccess(response, {
      statusCode: isAutoAccepted ? 200 : 201,
      message: isAutoAccepted
        ? 'Mutual connection accepted!'
        : 'Connection request sent successfully.',
      data: connection,
    });
  }),

  respond: asyncHandler(async (request, response) => {
    const body = request.body as RespondConnectionInput;
    const connection = await connectionService.respond({
      connectionId: request.params.id as string,
      recipientId: request.auth!.userId,
      universityId: request.auth!.universityId,
      status: body.status,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message:
        body.status === 'ACCEPTED'
          ? 'Connection request accepted.'
          : 'Connection request declined.',
      data: connection,
    });
  }),

  cancel: asyncHandler(async (request, response) => {
    const connection = await connectionService.cancel({
      connectionId: request.params.id as string,
      requesterId: request.auth!.userId,
      universityId: request.auth!.universityId,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Connection request cancelled.',
      data: connection,
    });
  }),

  remove: asyncHandler(async (request, response) => {
    await connectionService.remove({
      connectionId: request.params.id as string,
      userId: request.auth!.userId,
      universityId: request.auth!.universityId,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    });

    return sendSuccess(response, {
      message: 'Connection removed successfully.',
    });
  }),

  listMine: asyncHandler(async (request, response) => {
    const query = request.query as unknown as ConnectionQuery;
    const tab = query.tab ?? 'connected';

    if (tab === 'blocked') {
      const blockedList = await blockService.listBlocked(request.auth!.userId);
      return sendSuccess(response, {
        data: blockedList,
        meta: { page: 1, limit: blockedList.length, total: blockedList.length, totalPages: 1 },
      });
    }

    const result = await connectionService.listWithTab(
      request.auth!.universityId,
      request.auth!.userId,
      tab,
      {
        q: query.q,
        page: query.page,
        limit: query.limit,
      },
    );

    return sendSuccess(response, {
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  }),
};
