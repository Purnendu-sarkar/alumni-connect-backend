import type { RequestHandler } from 'express';

import { env } from '../config/index.js';
import { ApiError } from '../errors/api-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { tokenService } from '../services/auth/token.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authenticate: RequestHandler = asyncHandler(async (request, _response, next) => {
  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Provide an access token with the Bearer scheme.');
  }

  const payload = tokenService.verifyAccessToken(authorization.slice('Bearer '.length));
  const user = await userRepository.findAuthenticatedById(payload.sub);

  if (!user || !user.isActive || !user.university.isActive) {
    throw ApiError.unauthorized('This account is unavailable.');
  }

  if (env.NODE_ENV === 'production' && user.isDemo) {
    throw ApiError.unauthorized('Demo access tokens are deactivated in production.');
  }

  request.auth = {
    userId: user.id,
    universityId: user.universityId,
    role: user.role.name,
    permissions: user.role.permissions.map((permission) => permission.key),
    isDemo: user.isDemo,
  };
  request.tenant = {
    id: user.university.id,
    slug: user.university.slug,
    domain: user.university.domain,
  };

  next();
});
