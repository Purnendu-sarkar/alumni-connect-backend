import crypto from 'node:crypto';
import { UserStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogModel } from '../../models/audit-log.model.js';
import { sessionModel } from '../../models/session.model.js';
import { emailService } from '../email/email.service.js';
import { passwordService } from './password.service.js';

export const passwordResetService = {
  /**
   * Generates a 15-minute single-use password reset token and sends an email.
   * Safe against user enumeration: returns a uniform response whether user exists or not.
   */
  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: { select: { fullName: true } } },
    });

    if (!user || user.status === UserStatus.SUSPENDED) {
      return {
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched.',
      };
    }

    // Generate cryptographically secure token
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1_000); // 15 minutes

    // Delete any previous active reset tokens for this user
    await prisma.verificationToken.deleteMany({
      where: {
        userId: user.id,
        type: 'PASSWORD_RESET',
      },
    });

    // Create new token record
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: 'PASSWORD_RESET',
        expiresAt,
      },
    });

    const fullName = user.profile?.fullName ?? user.email;
    const emailResult = await emailService.sendPasswordResetEmail(user.email, fullName, plainToken);

    return {
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched.',
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      ...(env.NODE_ENV !== 'production' ? { debugToken: plainToken, resetUrl: emailResult.resetUrl } : {}),
    };
  },

  /**
   * Verifies reset token and updates user password securely.
   */
  async resetPassword(plainToken: string, newPassword: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid reset token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!tokenRecord || tokenRecord.type !== 'PASSWORD_RESET') {
      throw ApiError.badRequest('Invalid or unrecognized password reset token.');
    }

    if (tokenRecord.usedAt !== null) {
      throw ApiError.badRequest('This password reset link has already been used.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest('This password reset link has expired. Please request a new one.');
    }

    const passwordHash = await passwordService.hash(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
      });

      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
    });

    // Revoke all existing sessions on password reset
    await sessionModel.revokeAllForUser(tokenRecord.user.id, 'PASSWORD_RESET');

    await auditLogModel.record({
      actorId: tokenRecord.user.id,
      action: 'PASSWORD_RESET_SUCCESS',
      targetType: 'User',
      targetId: tokenRecord.user.id,
      metadata: { reason: 'Password reset completed via token' },
    });

    return {
      success: true,
      message: 'Your password has been reset successfully. Please log in with your new password.',
    };
  },

  /**
   * Dispatches email verification link.
   */
  async sendVerificationEmail(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: { select: { fullName: true } } },
    });

    if (!user) {
      throw ApiError.notFound('User');
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000); // 24 hours

    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION' },
    });

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: 'EMAIL_VERIFICATION',
        expiresAt,
      },
    });

    const fullName = user.profile?.fullName ?? user.email;
    const emailResult = await emailService.sendVerificationEmail(user.email, fullName, plainToken);

    return {
      success: true,
      message: 'Verification link has been sent to your email address.',
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      ...(env.NODE_ENV !== 'production' ? { debugToken: plainToken, verificationUrl: emailResult.verificationUrl } : {}),
    };
  },

  /**
   * Consumes single-use email verification token and marks user as verified.
   */
  async verifyEmail(plainToken: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid verification token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: true,
      },
    });

    if (!tokenRecord || tokenRecord.type !== 'EMAIL_VERIFICATION') {
      throw ApiError.badRequest('Invalid or unrecognized email verification token.');
    }

    if (tokenRecord.usedAt !== null) {
      throw ApiError.badRequest('This verification link has already been used.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest('This verification link has expired. Please request a new one.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
        },
      });

      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });
    });

    await auditLogModel.record({
      actorId: tokenRecord.user.id,
      action: 'EMAIL_VERIFIED',
      targetType: 'User',
      targetId: tokenRecord.user.id,
    });

    return {
      success: true,
      message: 'Email address verified successfully.',
    };
  },
};
