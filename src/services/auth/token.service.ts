import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';

import { env, shouldUseSecureCookies } from '../../config/index.js';
import { ApiError } from '../../errors/api-error.js';

export interface TokenSubject {
  userId: string;
  role: Role;
  sessionId: string;
  familyId: string;
}

export interface DecodedAccessToken extends JwtPayload {
  sub: string;
  role: Role;
  sessionId: string;
  familyId: string;
  tokenType: 'access';
}

export interface DecodedRefreshToken extends JwtPayload {
  sub: string;
  sessionId: string;
  familyId: string;
  tokenType: 'refresh';
  jti: string;
}

function durationToMilliseconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error('JWT TTL must use a whole number followed by s, m, h, or d.');
  }

  const amount = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit];
}

export const tokenService = {
  createAccessToken(subject: TokenSubject) {
    const payload = {
      sub: subject.userId,
      role: subject.role,
      sessionId: subject.sessionId,
      familyId: subject.familyId,
      tokenType: 'access',
    };

    const options: SignOptions = {
      issuer: 'alumni-connect-api',
      audience: 'alumni-connect-client',
      expiresIn: env.JWT_ACCESS_TTL as `${number}${'s' | 'm' | 'h' | 'd'}`,
    };

    return {
      token: jwt.sign(payload, env.JWT_ACCESS_SECRET, options),
      expiresAt: new Date(Date.now() + durationToMilliseconds(env.JWT_ACCESS_TTL)),
    };
  },

  createRefreshToken(subject: TokenSubject) {
    const tokenId = randomUUID();
    const payload = {
      sub: subject.userId,
      sessionId: subject.sessionId,
      familyId: subject.familyId,
      tokenType: 'refresh',
      jti: tokenId,
    };

    const options: SignOptions = {
      issuer: 'alumni-connect-api',
      audience: 'alumni-connect-client',
      expiresIn: env.JWT_REFRESH_TTL as `${number}${'s' | 'm' | 'h' | 'd'}`,
    };

    const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
    const tokenHash = this.hashToken(token);

    return {
      tokenId,
      token,
      tokenHash,
      expiresAt: new Date(Date.now() + durationToMilliseconds(env.JWT_REFRESH_TTL)),
    };
  },

  verifyAccessToken(token: string): DecodedAccessToken {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'alumni-connect-api',
        audience: 'alumni-connect-client',
      });

      if (typeof decoded === 'string' || decoded.tokenType !== 'access') {
        throw ApiError.unauthorized('Invalid access token payload.');
      }

      return decoded as DecodedAccessToken;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized('Access token is invalid or expired.');
    }
  },

  verifyRefreshToken(token: string): DecodedRefreshToken {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        issuer: 'alumni-connect-api',
        audience: 'alumni-connect-client',
      });

      if (typeof decoded === 'string' || decoded.tokenType !== 'refresh') {
        throw ApiError.unauthorized('Invalid refresh token payload.');
      }

      return decoded as DecodedRefreshToken;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized('Refresh token is invalid or expired.');
    }
  },

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  },

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: shouldUseSecureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: durationToMilliseconds(env.JWT_ACCESS_TTL),
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: shouldUseSecureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: durationToMilliseconds(env.JWT_REFRESH_TTL),
    });
  },

  clearAuthCookies(res: Response) {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
  },
};
