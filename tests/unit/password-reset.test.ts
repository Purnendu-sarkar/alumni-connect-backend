import { describe, expect, it, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { passwordResetService } from '../../src/services/auth/password-reset.service.js';
import { prisma } from '../../src/config/database.js';
import { emailService } from '../../src/services/email/email.service.js';
import { passwordService } from '../../src/services/auth/password.service.js';
import { tokenRepository } from '../../src/repositories/token.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';

describe('PasswordResetService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestPasswordReset', () => {
    it('dispatches email with single-use token when user exists', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        name: 'Rahim Khan',
        email: 'rahim@university.edu',
        isActive: true,
      } as any);

      vi.spyOn(prisma.verificationToken, 'deleteMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.verificationToken, 'create').mockResolvedValue({ id: 'token-rec-1' } as any);
      vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({
        success: true,
        deliveredViaSmtp: false,
        token: 'plain-token-abc',
        resetUrl: 'http://localhost:3000/reset-password?token=plain-token-abc',
      });

      const res = await passwordResetService.requestPasswordReset('rahim@university.edu');

      expect(res.success).toBe(true);
      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-123',
            type: 'PASSWORD_RESET',
          }),
        }),
      );
    });

    it('returns generic success message even if email does not exist (anti-enumeration)', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      const res = await passwordResetService.requestPasswordReset('nonexistent@example.com');

      expect(res.success).toBe(true);
      expect(res.message).toContain('If an account exists with that email');
    });
  });

  describe('resetPassword', () => {
    it('successfully resets password and consumes single-use token', async () => {
      const plainToken = 'valid-test-token-123';
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'tok-1',
        tokenHash,
        type: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins from now
        user: { id: 'user-1', email: 'user@test.edu', universityId: 'uni-1', isActive: true },
      } as any);

      vi.spyOn(passwordService, 'hash').mockResolvedValue('new-argon2-hash');
      vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const mockTx = {
        user: { update: vi.fn().mockResolvedValue({}) },
        verificationToken: { update: vi.fn().mockResolvedValue({}) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(mockTx));

      const res = await passwordResetService.resetPassword(plainToken, 'NewStrongPass123!#');

      expect(res.success).toBe(true);
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { passwordHash: 'new-argon2-hash' },
        }),
      );
      expect(mockTx.verificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-1' },
          data: expect.objectContaining({ consumedAt: expect.any(Date) }),
        }),
      );
      expect(tokenRepository.revokeByUserId).toHaveBeenCalledWith('user-1');
    });

    it('rejects if token was already consumed (single-use enforcement)', async () => {
      const plainToken = 'consumed-token-123';
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'tok-1',
        tokenHash,
        type: 'PASSWORD_RESET',
        consumedAt: new Date(Date.now() - 5 * 60 * 1000), // already consumed
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        user: { id: 'user-1', isActive: true },
      } as any);

      await expect(passwordResetService.resetPassword(plainToken, 'NewPass123!#')).rejects.toThrow(
        /already been used/,
      );
    });

    it('rejects if token is expired (15-minute time window enforcement)', async () => {
      const plainToken = 'expired-token-123';
      const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'tok-1',
        tokenHash,
        type: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
        user: { id: 'user-1', isActive: true },
      } as any);

      await expect(passwordResetService.resetPassword(plainToken, 'NewPass123!#')).rejects.toThrow(
        /link has expired/,
      );
    });
  });
});
