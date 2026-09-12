import { createHash, randomUUID } from 'node:crypto';

import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../../config/index.js';
import type { RoleName } from '../../generated/prisma/client.js';
import { ApiError } from '../../errors/api-error.js';

interface TokenSubject {
  userId: string;
  universityId: string;
  role: RoleName;
}

interface DecodedToken extends JwtPayload {
  sub: string;
  universityId: string;
  role: RoleName;
  tokenType: 'access' | 'refresh';
  jti?: string;
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

function decode(token: string, secret: string): DecodedToken {
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'alumni-connect-api',
      audience: 'alumni-connect-client',
    });

    if (
      typeof decoded === 'string' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.universityId !== 'string' ||
      typeof decoded.role !== 'string' ||
      (decoded.tokenType !== 'access' && decoded.tokenType !== 'refresh')
    ) {
      throw ApiError.unauthorized('The authentication token is malformed.');
    }

    return decoded as DecodedToken;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('The authentication token is invalid or expired.');
  }
}

export const tokenService = {
  createAccessToken(subject: TokenSubject) {
    const options: SignOptions = {
      expiresIn: env.JWT_ACCESS_TTL as NonNullable<SignOptions['expiresIn']>,
      issuer: 'alumni-connect-api',
      audience: 'alumni-connect-client',
    };

    return jwt.sign(
      {
        universityId: subject.universityId,
        role: subject.role,
        tokenType: 'access',
      },
      env.JWT_ACCESS_SECRET,
      { ...options, subject: subject.userId },
    );
  },

  createRefreshToken(subject: TokenSubject) {
    const id = randomUUID();
    const options: SignOptions = {
      expiresIn: env.JWT_REFRESH_TTL as NonNullable<SignOptions['expiresIn']>,
      issuer: 'alumni-connect-api',
      audience: 'alumni-connect-client',
      jwtid: id,
    };
    const token = jwt.sign(
      {
        universityId: subject.universityId,
        role: subject.role,
        tokenType: 'refresh',
      },
      env.JWT_REFRESH_SECRET,
      { ...options, subject: subject.userId },
    );

    return {
      id,
      token,
      expiresAt: new Date(Date.now() + durationToMilliseconds(env.JWT_REFRESH_TTL)),
    };
  },

  verifyAccessToken(token: string) {
    const decoded = decode(token, env.JWT_ACCESS_SECRET);
    if (decoded.tokenType !== 'access') throw ApiError.unauthorized('An access token is required.');
    return decoded;
  },

  verifyRefreshToken(token: string) {
    const decoded = decode(token, env.JWT_REFRESH_SECRET);
    if (decoded.tokenType !== 'refresh' || !decoded.jti) {
      throw ApiError.unauthorized('A refresh token is required.');
    }
    return decoded;
  },

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  },
};
