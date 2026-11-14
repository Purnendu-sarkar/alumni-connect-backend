import crypto from 'node:crypto';
import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { logger } from '../../config/logger.js';
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
          select: { id: true, name: true, email: true, universityId: true, isActive: true, passwordHash: true },
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

    if (tokenRecord.user.passwordHash) {
      const isSamePassword = await passwordService.verify(tokenRecord.user.passwordHash, newPassword);
      if (isSamePassword) {
        throw new ApiError(
          422,
          'New password cannot be the same as your current password.',
          'PASSWORD_REUSE_NOT_ALLOWED',
        );
      }
    }

    const newPasswordHash = await passwordService.hash(newPassword);

    await prisma.$transaction(async (tx) => {
      // 1. Update user password and clear needPasswordChange
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          passwordHash: newPasswordHash,
          needPasswordChange: false,
        },
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
        action: 'PASSWORD_RESET_COMPLETED',
        targetType: 'user',
        targetId: tokenRecord.user.id,
      });
    });

    // Send asynchronous security alert email
    emailService.sendSecurityAlertEmail(tokenRecord.user.email, tokenRecord.user.name, 'PASSWORD_RESET').catch((err) => {
      logger.warn({ err }, 'Failed to dispatch security alert email after password reset.');
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
   * Safe public resend email verification method that prevents user enumeration.
   */
  async resendEmailVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, verified: true, isActive: true },
    });

    if (!user || user.verified || !user.isActive) {
      return {
        success: true,
        message: 'If an account exists with that email, a verification link has been dispatched.',
      };
    }

    return this.requestEmailVerification(user.id);
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

    const targetUser = await prisma.user.findUnique({
      where: { id: tokenRecord.user.id },
      include: { role: true },
    });
    const isStudent = targetUser?.role.name === 'STUDENT';

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.user.id },
        data: {
          verified: true,
          ...(isStudent ? { verificationStatus: 'APPROVED' } : {}),
        },
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
      role: targetUser?.role.name,
      message: isStudent
        ? 'Email address verified successfully. Your student account is now active. Please sign in.'
        : 'Email address verified successfully. Your alumni account is pending administrative verification.',
    };
  },
};
