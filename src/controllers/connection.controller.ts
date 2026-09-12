import { connectionService } from '../services/connection/connection.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type {
  createConnectionSchema,
  respondConnectionSchema,
} from '../validators/connection.schema.js';
import type { z } from 'zod';

type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
type RespondConnectionInput = z.infer<typeof respondConnectionSchema>;

export const connectionController = {
  create: asyncHandler(async (request, response) => {
    const body = request.body as CreateConnectionInput;
    const connection = await connectionService.create({
      universityId: request.auth!.universityId,
      requesterId: request.auth!.userId,
      ...body,
    });
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Connection request sent.',
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
    });
    return sendSuccess(response, { message: 'Connection request updated.', data: connection });
  }),

  listMine: asyncHandler(async (request, response) => {
    const connections = await connectionService.list(
      request.auth!.universityId,
      request.auth!.userId,
    );
    return sendSuccess(response, { data: connections });
  }),
};
