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
    const result = await authService.register(request.body as RegisterInput);
    return sendSuccess(response, {
      statusCode: 201,
      message:
        'Account registered successfully. Please check your university email for the verification link.',
      data: { user: result.user },
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

  validateSetupAccount: asyncHandler(async (request, response) => {
    const token = request.query.token as string;
    const result = await authService.validateSetupAccount(token);
    return sendSuccess(response, { data: result });
  }),

  setupAccount: asyncHandler(async (request, response) => {
    const { token, name, password } = request.body as { token: string; name: string; password: string };
    const session = await authService.setupAccount({ token, name, password });
    writeRefreshCookie(response, session.refreshToken, session.refreshExpiresAt);
    return sendSuccess(response, {
      statusCode: 201,
      message: 'Moderator account activated successfully.',
      data: { accessToken: session.accessToken, user: session.user },
    });
  }),

  changePassword: asyncHandler(async (request, response) => {
    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };
    const result = await authService.changePassword(
      request.auth!.userId,
      currentPassword,
      newPassword,
    );
    return sendSuccess(response, { message: result.message });
  }),

  forgotPassword: asyncHandler(async (request, response) => {
    const { email } = request.body as { email: string };
    const { passwordResetService } = await import('../services/auth/password-reset.service.js');
    const result = await passwordResetService.requestPasswordReset(email);
    return sendSuccess(response, {
      message: result.message,
      data: result,
    });
  }),

  resetPassword: asyncHandler(async (request, response) => {
    const { token, newPassword } = request.body as { token: string; newPassword: string };
    const { passwordResetService } = await import('../services/auth/password-reset.service.js');
    const result = await passwordResetService.resetPassword(token, newPassword);
    return sendSuccess(response, {
      message: result.message,
    });
  }),

  sendVerificationEmail: asyncHandler(async (request, response) => {
    const { passwordResetService } = await import('../services/auth/password-reset.service.js');
    const result = await passwordResetService.requestEmailVerification(request.auth!.userId);
    return sendSuccess(response, {
      message: result.message,
      data: result,
    });
  }),

  resendVerificationEmail: asyncHandler(async (request, response) => {
    const { email } = request.body as { email?: string };
    if (!email) {
      return sendSuccess(response, {
        message: 'If an account exists with that email, a verification link has been dispatched.',
      });
    }
    const { prisma } = await import('../config/database.js');
    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.verified) {
      return sendSuccess(response, {
        message: 'If an account exists with that email, a verification link has been dispatched.',
      });
    }
    const { passwordResetService } = await import('../services/auth/password-reset.service.js');
    const result = await passwordResetService.requestEmailVerification(user.id);
    return sendSuccess(response, {
      message: 'If an account exists with that email, a verification link has been dispatched.',
      data: result,
    });
  }),

  verifyEmail: asyncHandler(async (request, response) => {
    const { token } = request.body as { token: string };
    const { passwordResetService } = await import('../services/auth/password-reset.service.js');
    const result = await passwordResetService.verifyEmail(token);
    return sendSuccess(response, {
      message: result.message,
      data: { role: (result as any).role },
    });
  }),
};
