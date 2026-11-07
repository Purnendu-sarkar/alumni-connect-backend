import type { RequestHandler } from 'express';
import { Role } from '@prisma/client';

import { ApiError } from '../errors/api-error.js';
import { sessionModel } from '../models/session.model.js';
import { asyncHandler } from '../utils/async-handler.js';

export const requireReauth: RequestHandler = asyncHandler(async (request, _response, next) => {
  if (!request.user || request.user.role !== Role.SUPER_ADMIN) {
    return next();
  }

  const sessionId = request.user.sessionId;
  if (!sessionId) {
    throw ApiError.reauthRequired();
  }

  const session = await sessionModel.findById(sessionId);
  if (!session || !session.reauthUntil) {
    throw ApiError.reauthRequired('Password confirmation required to proceed with this sensitive action.');
  }

  if (Date.now() > session.reauthUntil.getTime()) {
    throw ApiError.reauthRequired('Your 15-minute administrative operational window has expired. Please re-enter your password.');
  }

  next();
});

