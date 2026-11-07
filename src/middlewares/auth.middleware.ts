import type { RequestHandler } from 'express';
import { UserStatus } from '@prisma/client';

import { ApiError } from '../errors/api-error.js';
import { userModel } from '../models/user.model.js';
import { rolePermissionMap } from '../constants/permissions.js';
import { tokenService } from '../services/auth/token.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authenticate: RequestHandler = asyncHandler(async (request, _response, next) => {
  let token: string | undefined;

  // 1. Primary: HttpOnly Cookie
  if (request.cookies?.access_token) {
    token = request.cookies.access_token;
  }

  // 2. Fallback: Authorization Bearer header
  if (!token) {
    const authHeader = request.header('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length).trim();
    }
  }

  if (!token) {
    throw ApiError.unauthenticated('Authentication is required. Missing session cookie or Bearer token.');
  }

  const payload = tokenService.verifyAccessToken(token);
  const user = await userModel.findById(payload.sub);

  if (!user) {
    throw ApiError.unauthenticated('Account associated with this session no longer exists.');
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw ApiError.accountSuspended();
  }

  const permissions = [...(rolePermissionMap[user.role] ?? [])];

  request.user = {
    id: user.id,
    email: user.email,
    name: user.profile?.fullName ?? user.email,
    role: user.role,
    status: user.status,
    verificationStatus: user.verificationStatus,
    sessionId: payload.sessionId,
    familyId: payload.familyId,
    permissions,
  };

  request.session = {
    id: payload.sessionId,
    familyId: payload.familyId,
  };

  next();
});
