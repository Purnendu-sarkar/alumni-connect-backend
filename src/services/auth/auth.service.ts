import crypto, { randomUUID } from 'node:crypto';
import { Role, TokenType, UserStatus, VerificationStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { userModel } from '../../models/user.model.js';
import { sessionModel } from '../../models/session.model.js';
import { auditLogModel } from '../../models/audit-log.model.js';
import { emailService } from '../email/email.service.js';
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

    // 1. Check duplicate email
    const existingUser = await userModel.findByEmail(email);
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.', 'DUPLICATE_EMAIL');
    }

    // 2. Check duplicate institutional University ID
    if (input.universityId) {
      const existingId = await userModel.findByUniversityId(input.universityId);
      if (existingId) {
        throw ApiError.conflict(
          'An account with this University ID already exists.',
          'DUPLICATE_UNIVERSITY_ID',
        );
      }
    }

    const passwordHash = await passwordService.hash(input.password);

    // Initial lifecycle status:
    // Both Student and Alumni enter PENDING_EMAIL_VERIFICATION.
    // Student requires no further admin verification after email check.
    // Alumni requires admin verification after email check.
    const status = UserStatus.PENDING_EMAIL_VERIFICATION;
    const verificationStatus =
      input.role === Role.ALUMNI ? VerificationStatus.PENDING : VerificationStatus.NOT_REQUIRED;

    const parsedBatch = input.batch ? parseInt(input.batch, 10) : undefined;

    // Generate single-use email verification token
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: input.role,
          status,
          verificationStatus,
          universityId: input.universityId?.trim(),
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

      await tx.verificationToken.create({
        data: {
          userId: createdUser.id,
          tokenHash,
          type: TokenType.EMAIL_VERIFICATION,
          expiresAt,
        },
      });

      return createdUser;
    });

    // Dispatch verification email (captured in memory as fallback if local SMTP is offline)
    await emailService.sendVerificationEmail(user.email, input.name.trim(), plainToken);

    await auditLogModel.record({
      actorId: user.id,
      actorRole: user.role,
      action: 'USER_REGISTER',
      targetType: 'User',
      targetId: user.id,
      metadata: { reason: 'Self-registration through registration portal' },
    });

    return {
      ...user,
      verificationEmailSent: true,
    };
  },

  async verifyEmail(plainToken: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid email verification token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.EMAIL_VERIFICATION) {
      throw ApiError.badRequest('Invalid or unrecognized email verification token.');
    }

    if (tokenRecord.usedAt !== null) {
      throw ApiError.badRequest('This verification link has already been used.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest('This verification link has expired. Please request a new one.');
    }

    // Role-specific lifecycle transition:
    // STUDENT -> ACTIVE (ready to access student dashboard immediately)
    // ALUMNI -> PENDING_ADMIN_VERIFICATION (requires administrator approval before dashboard access)
    let nextStatus: UserStatus = UserStatus.ACTIVE;
    let nextVerification: VerificationStatus = VerificationStatus.NOT_REQUIRED;
    let message = 'Your email address has been verified successfully. You can now sign in.';

    if (tokenRecord.user.role === Role.ALUMNI) {
      nextStatus = UserStatus.PENDING_ADMIN_VERIFICATION;
      nextVerification = VerificationStatus.PENDING;
      message =
        'Email verified successfully! Your alumni account has been queued for administrative verification. You will receive an email once approved.';
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          emailVerifiedAt: new Date(),
          status: nextStatus,
          verificationStatus: nextVerification,
        },
      });

      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
    });

    await auditLogModel.record({
      actorId: tokenRecord.user.id,
      actorRole: tokenRecord.user.role,
      action: 'EMAIL_VERIFIED',
      targetType: 'User',
      targetId: tokenRecord.user.id,
      metadata: { newStatus: nextStatus },
    });

    return {
      success: true,
      message,
      role: tokenRecord.user.role,
      status: nextStatus,
    };
  },

  async resendVerificationEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || user.status !== UserStatus.PENDING_EMAIL_VERIFICATION) {
      return {
        success: true,
        message: 'If an unverified account exists with that email address, a verification link has been resent.',
      };
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: TokenType.EMAIL_VERIFICATION },
    });

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: TokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });

    await emailService.sendVerificationEmail(
      user.email,
      user.profile?.fullName ?? user.email,
      plainToken,
    );

    return {
      success: true,
      message: 'If an unverified account exists with that email address, a verification link has been resent.',
    };
  },

  async validateSetupToken(plainToken: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid account setup token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.ACCOUNT_SETUP) {
      throw ApiError.badRequest('Invalid or unrecognized account setup link.');
    }

    if (tokenRecord.usedAt !== null) {
      throw ApiError.badRequest('This account setup link has already been used. Please log in.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest(
        'This account setup link has expired. Please contact an administrator.',
      );
    }

    return {
      valid: true,
      email: tokenRecord.user.email,
      name: tokenRecord.user.profile?.fullName,
      role: tokenRecord.user.role,
    };
  },

  async setupAccount(input: { token: string; password: string }) {
    const { token: plainToken, password } = input;
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid account setup token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.ACCOUNT_SETUP) {
      throw ApiError.badRequest('Invalid or unrecognized account setup link.');
    }

    if (tokenRecord.usedAt !== null) {
      throw ApiError.badRequest('This account setup link has already been used. Please log in.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest(
        'This account setup link has expired. Please contact an administrator.',
      );
    }

    const passwordHash = await passwordService.hash(password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          passwordChangedAt: new Date(),
          emailVerifiedAt: new Date(),
        },
      });

      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
    });

    await auditLogModel.record({
      actorId: tokenRecord.user.id,
      actorRole: tokenRecord.user.role,
      action: 'ACCOUNT_SETUP_COMPLETED',
      targetType: 'User',
      targetId: tokenRecord.user.id,
      metadata: { reason: 'Initial password setup completed via single-use token' },
    });

    return {
      success: true,
      message: 'Account configured and activated successfully. You can now log in.',
    };
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

    // Comprehensive lifecycle status enforcement:
    if (user.status === UserStatus.PENDING_EMAIL_VERIFICATION) {
      throw new ApiError(
        403,
        'Your institutional email has not been verified yet. Please check your inbox for the verification link.',
        'PENDING_EMAIL_VERIFICATION',
      );
    }

    if (user.status === UserStatus.PENDING_ADMIN_VERIFICATION) {
      throw new ApiError(
        403,
        'Your alumni account is pending administrator review and verification. You will be notified via email once approved.',
        'PENDING_ADMIN_VERIFICATION',
      );
    }

    if (user.status === UserStatus.PENDING_SETUP) {
      throw new ApiError(
        403,
        'Your account setup is pending. Please complete your initial password configuration via the setup link sent to your email.',
        'PENDING_SETUP',
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw ApiError.accountSuspended();
    }

    if (user.status === UserStatus.VERIFICATION_REJECTED) {
      const reasonDetail = user.verificationNote ? ` Reason: ${user.verificationNote}` : '';
      throw new ApiError(
        403,
        `Your verification request was rejected by platform administration.${reasonDetail}`,
        'VERIFICATION_REJECTED',
      );
    }

    if (user.status === UserStatus.DEACTIVATED) {
      throw new ApiError(403, 'Your account has been deactivated. Please contact administration.', 'ACCOUNT_DEACTIVATED');
    }

    if (user.status === UserStatus.DELETED || user.status === UserStatus.DELETION_PENDING) {
      throw new ApiError(403, 'This account is no longer active.', 'ACCOUNT_DELETED');
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
    tokenService.verifyRefreshToken(refreshToken);
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
