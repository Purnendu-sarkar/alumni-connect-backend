import type { CookieOptions, Response } from 'express';

import { shouldUseSecureCookies } from '../config/index.js';
import { authService } from '../services/auth/auth.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import type { loginSchema, registerSchema } from '../validators/auth.schema.js';
import type { z } from 'zod';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureCookies,
  sameSite: 'lax',
  path: '/api/v1/auth',
};

function writeRefreshCookie(response: Response, refreshToken: string, expiresAt: Date) {
  response.cookie('refreshToken', refreshToken, { ...refreshCookieOptions, expires: expiresAt });
}

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

export const authController = {
  register: asyncHandler(async (request, response) => {
    const session = await authService.register(request.body as RegisterInput);
    writeRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Account created. Alumni accounts await university verification.',
      data: { accessToken: session.accessToken, user: session.user },
    });
  }),

  login: asyncHandler(async (request, response) => {
    const body = request.body as LoginInput;
    const session = await authService.login(body.email, body.password);
    writeRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);
    return sendSuccess(response, {
      message: 'Signed in successfully.',
      data: { accessToken: session.accessToken, user: session.user },
    });
  }),

  refresh: asyncHandler(async (request, response) => {
    const session = await authService.refresh(request.cookies.refreshToken as string | undefined);
    writeRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);
    return sendSuccess(response, {
      message: 'Session refreshed.',
      data: { accessToken: session.accessToken, user: session.user },
    });
  }),

  logout: asyncHandler(async (request, response) => {
    await authService.logout(request.cookies.refreshToken as string | undefined);
    response.clearCookie('refreshToken', refreshCookieOptions);
    return sendSuccess(response, { message: 'Signed out successfully.' });
  }),

  me: asyncHandler(async (request, response) => {
    const user = await authService.me(request.auth!.userId);
    return sendSuccess(response, { data: user });
  }),
};
