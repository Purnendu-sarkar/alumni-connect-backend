import type { Request, Response } from 'express';

import { userService } from '../services/user/user.service.js';
import { sendSuccess } from '../utils/api-response.js';

export const alumniPresenter = {
  async listDirectory(req: Request, res: Response) {
    const department = req.query.department as string | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await userService.listDirectory({
      department,
      search,
      page,
      limit,
    });

    return sendSuccess(res, {
      data: result.users,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  },

  async getAlumnusById(req: Request, res: Response) {
    const id = req.params.id as string;
    const user = await userService.getProfile(id);
    return sendSuccess(res, { data: user });
  },
};
