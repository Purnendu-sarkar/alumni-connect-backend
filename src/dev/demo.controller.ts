import type { CookieOptions, Response } from 'express';
import { z } from 'zod';

import { env, shouldUseSecureCookies } from '../config/index.js';
import { ApiError } from '../errors/api-error.js';
import { RoleName } from '../generated/prisma/client.js';
import { issueSession } from '../services/auth/auth.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { DEMO_ROLES_INFO, demoService } from './demo.service.js';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureCookies,
  sameSite: 'lax',
  path: '/api/v1/auth',
};

function writeRefreshCookie(response: Response, refreshToken: string, expiresAt: Date) {
  response.cookie('refreshToken', refreshToken, { ...refreshCookieOptions, expires: expiresAt });
}

export const demoRoleSchema = z.object({
  role: z.nativeEnum(RoleName),
});

export const demoController = {
  getCapabilities: asyncHandler(async (_request, response) => {
    const isAvailable = env.DEMO_ENABLED && env.NODE_ENV !== 'production';

    return sendSuccess(response, {
      data: {
        enabled: isAvailable,
        roles: isAvailable
          ? DEMO_ROLES_INFO.map(({ role, label, desc }) => ({ role, label, desc }))
          : [],
      },
    });
  }),

  demoLogin: asyncHandler(async (request, response) => {
    if (!env.DEMO_ENABLED || env.NODE_ENV === 'production') {
      throw ApiError.forbidden('Development demo access is disabled in this environment.');
    }

    const { role } = demoRoleSchema.parse(request.body);

    const user = await demoService.findDemoUserByRole(role);
    if (!user) {
      throw ApiError.notFound(`Demo user record for role '${role}'`);
    }

    const session = await issueSession(user);
    writeRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);

    return sendSuccess(response, {
      message: `Successfully authenticated as Demo ${role}.`,
      data: {
        accessToken: session.accessToken,
        user: session.user,
      },
    });
  }),

  getCapturedEmails: asyncHandler(async (_request, response) => {
    const { emailService } = await import('../services/email/email.service.js');
    return sendSuccess(response, {
      data: emailService.getCapturedEmails(),
    });
  }),
};
