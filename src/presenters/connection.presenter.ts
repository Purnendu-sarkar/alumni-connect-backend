import type { Request, Response } from 'express';
import { ConnectionStatus } from '@prisma/client';

import { connectionService } from '../services/connection/connection.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';

export const connectionPresenter = {
  async sendRequest(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const { receiverId, note } = req.body;
    if (!receiverId) throw ApiError.badRequest('Target member ID (receiverId) is required.');

    const connection = await connectionService.createRequest({
      requesterId: req.user.id,
      receiverId,
      note,
    });

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Connection request sent successfully.',
      data: connection,
    });
  },

  async respond(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const id = req.params.id as string;
    const { action } = req.body; // 'ACCEPT' | 'REJECT'

    if (action !== 'ACCEPT' && action !== 'REJECT') {
      throw ApiError.badRequest('Action must be ACCEPT or REJECT.');
    }

    const updated = await connectionService.respond({
      connectionId: id,
      userId: req.user.id,
      action,
    });

    return sendSuccess(res, {
      message: `Connection request ${action.toLowerCase()}ed.`,
      data: updated,
    });
  },

  async listMyConnections(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();

    const status = req.query.status as ConnectionStatus | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const [connections, total] = await connectionService.listUserConnections(req.user.id, {
      status,
      skip: (page - 1) * limit,
      take: limit,
    });

    return sendSuccess(res, {
      data: connections,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
};
