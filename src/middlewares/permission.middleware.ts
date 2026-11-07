import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';

import type { PermissionKey } from '../constants/permissions.js';
import { ApiError } from '../errors/api-error.js';

export function requirePermission(...requiredPermissions: PermissionKey[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) return next(ApiError.unauthorized());

    // Super Admin has all permissions
    if (request.user.role === 'SUPER_ADMIN') {
      return next();
    }

    const granted = new Set(request.user.permissions ?? []);
    const isAllowed = requiredPermissions.every((permission) => granted.has(permission));
    if (!isAllowed) return next(ApiError.forbidden());

    return next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) return next(ApiError.unauthorized());

    if (!roles.includes(request.user.role)) {
      return next(ApiError.forbidden(`This route requires one of the following roles: ${roles.join(', ')}`));
    }

    return next();
  };
}
