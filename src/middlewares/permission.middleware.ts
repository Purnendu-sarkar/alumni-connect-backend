import type { RequestHandler } from 'express';

import type { PermissionKey } from '../constants/permissions.js';
import { ApiError } from '../errors/api-error.js';

export function requirePermission(...requiredPermissions: PermissionKey[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(ApiError.unauthorized());

    const granted = new Set(request.auth.permissions);
    const isAllowed = requiredPermissions.every((permission) => granted.has(permission));
    if (!isAllowed) return next(ApiError.forbidden());

    return next();
  };
}
