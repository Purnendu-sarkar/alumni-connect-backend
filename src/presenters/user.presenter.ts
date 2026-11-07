import type { Request, Response } from 'express';

import { userService } from '../services/user/user.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';

export const userPresenter = {
  async getMyProfile(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();
    const profile = await userService.getProfile(req.user.id);
    return sendSuccess(res, { data: profile });
  },

  async updateMyProfile(req: Request, res: Response) {
    if (!req.user?.id) throw ApiError.unauthorized();
    const updated = await userService.updateProfile(req.user.id, req.body);
    return sendSuccess(res, {
      message: 'Profile updated successfully.',
      data: updated,
    });
  },

  async getUserById(req: Request, res: Response) {
    const id = req.params.id as string;
    const user = await userService.getProfile(id);
    return sendSuccess(res, { data: user });
  },
};
