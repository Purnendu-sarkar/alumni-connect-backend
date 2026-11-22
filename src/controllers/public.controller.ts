import type { Request, Response } from 'express';
import { publicService } from '../services/public/public.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

export const publicController = {
  getOverview: asyncHandler(async (_req: Request, res: Response) => {
    const overview = await publicService.getPublicOverview('north-western-university');
    return sendSuccess(res, { data: overview });
  }),
};
