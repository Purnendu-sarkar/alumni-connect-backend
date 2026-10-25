import crypto from 'node:crypto';
import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
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
      select: { id: true, name: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      // Uniform timing response
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

    // Send email via Mailpit / SMTP
    const emailResult = await emailService.sendPasswordResetEmail(user.email, user.name, plainToken);

    return {
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched.',
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      // Provide token in non-production response to facilitate testing and viva demonstration
      ...(env.NODE_ENV !== 'production' ? { debugToken: plainToken, resetUrl: emailResult.resetUrl } : {}),
    };
  },

  /**
   * Validates single-use token and expiry, updates password hash, and revokes previous sessions.
   */
  async resetPassword(plainToken: string, newPassword: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid password reset token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, universityId: true, isActive: true },
        },
      },
    });

    if (!tokenRecord || tokenRecord.type !== 'PASSWORD_RESET') {
      throw ApiError.badRequest('Invalid or unrecognized password reset token.');
    }

    if (tokenRecord.consumedAt !== null) {
      throw ApiError.badRequest('This password reset link has already been used.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest('This password reset link has expired. Please request a new one.');
    }

    if (!tokenRecord.user || !tokenRecord.user.isActive) {
      throw ApiError.badRequest('Associated account is inactive or disabled.');
    }

    const newPasswordHash = await passwordService.hash(newPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Update user password
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: { passwordHash: newPasswordHash },
      });

      // 2. Mark token as consumed (single-use guarantee)
      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() },
      });

      // 3. Revoke all active refresh sessions for security
      await tokenRepository.revokeByUserId(tokenRecord.user.id);

      // 4. Record audit log
      await auditLogRepository.record({
        universityId: tokenRecord.user.universityId,
        actorId: tokenRecord.user.id,
        action: 'auth.password_reset',
        targetType: 'user',
        targetId: tokenRecord.user.id,
      });
    });

    return {
      success: true,
      message: 'Your password has been reset successfully. Please sign in with your new credentials.',
    };
  },

  /**
   * Generates a 24-hour single-use email verification token.
   */
  async requestEmailVerification(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, verified: true },
    });

    if (!user) throw ApiError.notFound('User');
    if (user.verified) {
      return { success: true, message: 'Your email address is already verified.' };
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

    const emailResult = await emailService.sendVerificationEmail(user.email, user.name, plainToken);

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
        user: { select: { id: true, universityId: true } },
      },
    });

    if (!tokenRecord || tokenRecord.type !== 'EMAIL_VERIFICATION') {
      throw ApiError.badRequest('Invalid or unrecognized email verification token.');
    }

    if (tokenRecord.consumedAt !== null) {
      throw ApiError.badRequest('This verification link has already been used.');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw ApiError.badRequest('This verification link has expired. Please request a new one.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: { verified: true },
      });

      await tx.verificationToken.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() },
      });

      await auditLogRepository.record({
        universityId: tokenRecord.user.universityId,
        actorId: tokenRecord.user.id,
        action: 'auth.email_verified',
        targetType: 'user',
        targetId: tokenRecord.user.id,
      });
    });

    return {
      success: true,
      message: 'Email address verified successfully.',
    };
  },
};
