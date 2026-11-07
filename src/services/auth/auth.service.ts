import { randomUUID } from 'node:crypto';
import { Role, UserStatus, VerificationStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { userModel } from '../../models/user.model.js';
import { sessionModel } from '../../models/session.model.js';
import { auditLogModel } from '../../models/audit-log.model.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  universityId?: string; // Institutional ID (e.g. STU-2026-001)
  department: string;
  batch?: string;
  graduationYear?: number;
}

export const authService = {
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();

    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.', 'DUPLICATE');
    }

    const passwordHash = await passwordService.hash(input.password);

    // Initial status: Students & Alumni require verification; Super Admin and Moderator created via admin
    const status = UserStatus.PENDING_SETUP;
    const verificationStatus =
      input.role === Role.STUDENT || input.role === Role.ALUMNI
        ? VerificationStatus.PENDING
        : VerificationStatus.NOT_REQUIRED;

    const parsedBatch = input.batch ? parseInt(input.batch, 10) : undefined;

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: input.role,
          status,
          verificationStatus,
          universityId: input.universityId,
        },
      });

      await tx.profile.create({
        data: {
          userId: createdUser.id,
          fullName: input.name.trim(),
          department: input.department.trim(),
          graduationYear: input.graduationYear,
          batch: Number.isNaN(parsedBatch) ? undefined : parsedBatch,
        },
      });

      await tx.privacySetting.create({
        data: {
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

    await auditLogModel.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_REGISTER',
      targetType: 'User',
      targetId: user.id,
      metadata: { reason: 'Self-registration through registration portal' },
    });

    return user;
  },

  async login(
    input: { email: string; password: string },
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ) {
    const email = input.email.trim().toLowerCase();
    const user = await userModel.findByEmail(email);

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw ApiError.accountSuspended();
    }

    const emailHash = tokenService.hashToken(email);

    const isPasswordValid = await passwordService.verify(user.passwordHash, input.password);
    if (!isPasswordValid) {
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          emailHash,
          ip: metadata.ipAddress,
          userAgent: metadata.userAgent,
          success: false,
          failureReason: 'INVALID_CREDENTIALS',
        },
      });
      throw ApiError.unauthorized('Invalid email or password.');
    }

    // Generate Session Family
    const sessionId = randomUUID();
    const familyId = randomUUID();

    const refreshTokenData = tokenService.createRefreshToken({
      userId: user.id,
      role: user.role,
      sessionId,
      familyId,
    });

    const accessTokenData = tokenService.createAccessToken({
      userId: user.id,
      role: user.role,
      sessionId,
      familyId,
    });

    await sessionModel.create({
      userId: user.id,
      refreshTokenHash: refreshTokenData.tokenHash,
      familyId,
      expiresAt: refreshTokenData.expiresAt,
      userAgent: metadata.userAgent,
      ip: metadata.ipAddress,
    });

    await prisma.loginHistory.create({
      data: {
        userId: user.id,
        emailHash,
        ip: metadata.ipAddress,
        userAgent: metadata.userAgent,
        success: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.fullName ?? user.email,
        role: user.role,
        status: user.status,
        verificationStatus: user.verificationStatus,
        department: user.profile?.department,
        profile: user.profile,
      },
      accessToken: accessTokenData.token,
      refreshToken: refreshTokenData.token,
    };
  },

  async refresh(refreshToken: string) {
    const decoded = tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = tokenService.hashToken(refreshToken);

    const session = await sessionModel.findByTokenHash(tokenHash);

    if (!session) {
      throw ApiError.unauthorized('Session not found.');
    }

    // Replay detection: If token was already revoked, someone is replaying a stolen token!
    if (session.revokedAt) {
      await sessionModel.revokeFamily(session.familyId, 'REPLAY_ATTACK_DETECTED');
      throw ApiError.unauthorized('Compromised session detected. All sessions in this chain have been revoked.');
    }

    const user = session.user;
    if (user.status === UserStatus.SUSPENDED) {
      throw ApiError.accountSuspended();
    }

    // Rotate tokens
    const nextSessionId = randomUUID();
    const newRefreshTokenData = tokenService.createRefreshToken({
      userId: user.id,
      role: user.role,
      sessionId: nextSessionId,
      familyId: session.familyId,
    });

    const newAccessTokenData = tokenService.createAccessToken({
      userId: user.id,
      role: user.role,
      sessionId: nextSessionId,
      familyId: session.familyId,
    });

    await prisma.$transaction([
      prisma.session.update({
        where: { id: session.id },
        data: {
          revokedAt: new Date(),
          revokedReason: 'ROTATED',
        },
      }),
      prisma.session.create({
        data: {
          id: nextSessionId,
          userId: user.id,
          refreshTokenHash: newRefreshTokenData.tokenHash,
          familyId: session.familyId,
          rotatedFromId: session.id,
          expiresAt: newRefreshTokenData.expiresAt,
          userAgent: session.userAgent,
          ip: session.ip,
          reauthUntil: session.reauthUntil,
        },
      }),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.profile?.fullName ?? user.email,
        role: user.role,
        status: user.status,
        verificationStatus: user.verificationStatus,
        department: user.profile?.department,
        profile: user.profile,
      },
      accessToken: newAccessTokenData.token,
      refreshToken: newRefreshTokenData.token,
    };
  },

  async logout(sessionId?: string) {
    if (sessionId) {
      await sessionModel.revoke(sessionId).catch(() => {});
    }
  },

  async reauth(userId: string, sessionId: string, password: string) {
    const user = await userModel.findById(userId);
    if (!user) throw ApiError.unauthorized();

    const isPasswordValid = await passwordService.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw ApiError.forbidden('Invalid password for administrative re-authentication.');
    }

    // 15-minute re-authentication window as specified in SSOT
    const reauthUntil = new Date(Date.now() + 15 * 60 * 1000);
    await sessionModel.updateReauth(sessionId, reauthUntil);

    await auditLogModel.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'ADMIN_REAUTH_SUCCESS',
      targetType: 'Session',
      targetId: sessionId,
      metadata: { reason: '15-minute administrative window activated' },
    });

    return { reauthUntil };
  },
};
