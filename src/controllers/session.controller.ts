import type { Request } from 'express';

import { tokenService } from '../services/auth/token.service.js';
import { sessionService } from '../services/session/session.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';

function extractCurrentSessionId(request: Request): string | null {
  const cookieToken = request.cookies?.refreshToken as string | undefined;
  if (!cookieToken) return null;

  try {
    const payload = tokenService.verifyRefreshToken(cookieToken);
    return (payload.jti as string) ?? null;
  } catch {
    return null;
  }
}

export const sessionController = {
  listSessions: asyncHandler(async (request, response) => {
    const currentSessionId = extractCurrentSessionId(request);
    const sessions = await sessionService.listActiveSessions(
      request.auth!.userId,
      currentSessionId,
    );

    return sendSuccess(response, {
      message: 'Active sessions retrieved successfully.',
      data: sessions,
    });
  }),

  revokeSession: asyncHandler(async (request, response) => {
    const id = request.params.id as string;
    const currentSessionId = extractCurrentSessionId(request);

    await sessionService.revokeSession(
      request.auth!.userId,
      request.auth!.universityId,
      id,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );

    // If user terminated their current session, clear their refresh cookie
    if (currentSessionId && currentSessionId === id) {
      response.clearCookie('refreshToken', { path: '/api/v1' });
    }

    return sendSuccess(response, {
      message: 'Session revoked successfully.',
      data: { revokedSessionId: id },
    });
  }),

  revokeOthers: asyncHandler(async (request, response) => {
    const currentSessionId = extractCurrentSessionId(request);

    const result = await sessionService.revokeOtherSessions(
      request.auth!.userId,
      request.auth!.universityId,
      currentSessionId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'] as string | undefined,
        requestId: request.requestId,
      },
    );

    return sendSuccess(response, {
      message: `Signed out of ${result.revokedCount} alternate browser session(s).`,
      data: result,
    });
  }),
};
