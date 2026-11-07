import type { Request, Response } from 'express';

import { authService } from '../services/auth/auth.service.js';
import { tokenService } from '../services/auth/token.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { ApiError } from '../errors/api-error.js';

export const authPresenter = {
  async register(req: Request, res: Response) {
    const user = await authService.register(req.body);

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account registered successfully. Please verify your institutional identity.',
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        verificationStatus: user.verificationStatus,
      },
    });
  },

  async login(req: Request, res: Response) {
    const metadata = {
      userAgent: req.header('user-agent'),
      ipAddress: req.ip,
    };

    const result = await authService.login(req.body, metadata);

    // Set secure HTTP-only cookies
    tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);

    return sendSuccess(res, {
      message: 'Logged in successfully.',
      data: {
        user: result.user,
        accessToken: result.accessToken, // Optional fallback for clients
      },
    });
  },

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token cookie or payload is missing.');
    }

    const result = await authService.refresh(refreshToken);

    tokenService.setAuthCookies(res, result.accessToken, result.refreshToken);

    return sendSuccess(res, {
      message: 'Session refreshed successfully.',
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  },

  async logout(req: Request, res: Response) {
    const sessionId = req.user?.sessionId;
    await authService.logout(sessionId);

    tokenService.clearAuthCookies(res);

    return sendSuccess(res, {
      message: 'Logged out successfully.',
    });
  },

  async getCurrentUser(req: Request, res: Response) {
    return sendSuccess(res, {
      data: {
        user: req.user,
      },
    });
  },

  async reauth(req: Request, res: Response) {
    if (!req.user?.id || !req.user?.sessionId) {
      throw ApiError.unauthorized();
    }

    const { password } = req.body;
    if (!password) {
      throw ApiError.badRequest('Password is required for re-authentication.');
    }

    const result = await authService.reauth(req.user.id, req.user.sessionId, password);

    return sendSuccess(res, {
      message: 'Administrative password verified. 15-minute operational window activated.',
      data: result,
    });
  },
};
