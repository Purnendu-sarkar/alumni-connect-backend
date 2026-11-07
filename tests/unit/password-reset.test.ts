import { describe, expect, it, vi, beforeEach } from 'vitest';
import { passwordResetService } from '../../src/services/auth/password-reset.service.js';
import { prisma } from '../../src/config/database.js';
import { emailService } from '../../src/services/email/email.service.js';

describe('PasswordResetService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestPasswordReset', () => {
    it('dispatches email with single-use token when user exists', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-123',
        email: 'rahim@university.edu',
        status: 'ACTIVE',
        profile: { fullName: 'Rahim Khan' },
      } as any);

      vi.spyOn(prisma.verificationToken, 'deleteMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.verificationToken, 'create').mockResolvedValue({ id: 'token-rec-1' } as any);
      vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValue({
        success: true,
        deliveredViaSmtp: false,
        token: 'plain-token-abc',
        resetUrl: 'http://localhost:3000/reset-password?token=plain-token-abc',
      });

      const result = await passwordResetService.requestPasswordReset('rahim@university.edu');

      expect(result.success).toBe(true);
      expect(prisma.verificationToken.create).toHaveBeenCalledOnce();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledOnce();
    });
  });
});
