import type { RequestHandler } from 'express';

import type { PermissionKey } from '../constants/permissions.js';
import { ApiError } from '../errors/api-error.js';
import { auditLogRepository } from '../repositories/audit-log.repository.js';

export function requirePermission(...requiredPermissions: PermissionKey[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(ApiError.unauthorized());

    const granted = new Set(request.auth.permissions);
    const isAllowed = requiredPermissions.every((permission) => granted.has(permission));
    if (!isAllowed) {
      if (request.auth.universityId) {
        auditLogRepository
          .record({
            universityId: request.auth.universityId,
            actorId: request.auth.userId,
            actorRole: request.auth.role,
            action: 'FORBIDDEN_ACCESS',
            result: 'FAILURE',
            ip: request.ip,
            userAgent: request.headers['user-agent'] as string | undefined,
            requestId: request.requestId,
            targetType: 'endpoint',
            targetId: request.originalUrl,
            metadata: {
              requiredPermissions,
              path: request.originalUrl,
              method: request.method,
            },
          })
          .catch(() => {});
      }
      return next(ApiError.forbidden());
    }

    return next();
  };
}

export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(ApiError.unauthorized());

    if (!allowedRoles.includes(request.auth.role)) {
      if (request.auth.universityId) {
        auditLogRepository
          .record({
            universityId: request.auth.universityId,
            actorId: request.auth.userId,
            actorRole: request.auth.role,
            action: 'FORBIDDEN_ROLE_ACCESS',
            result: 'FAILURE',
            ip: request.ip,
            userAgent: request.headers['user-agent'] as string | undefined,
            requestId: request.requestId,
            targetType: 'endpoint',
            targetId: request.originalUrl,
            metadata: {
              allowedRoles,
              currentRole: request.auth.role,
              path: request.originalUrl,
              method: request.method,
            },
          })
          .catch(() => {});
      }
      return next(ApiError.forbidden('You do not have access to this institutional resource.'));
    }

    return next();
  };
}
