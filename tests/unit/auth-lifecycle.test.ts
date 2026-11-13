import { describe, expect, it, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { authService } from '../../src/services/auth/auth.service.js';
import { adminService } from '../../src/services/admin/admin.service.js';
import { passwordResetService } from '../../src/services/auth/password-reset.service.js';
import { prisma } from '../../src/config/database.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { passwordService } from '../../src/services/auth/password.service.js';
import { emailService } from '../../src/services/email/email.service.js';
import { tokenRepository } from '../../src/repositories/token.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';

describe('Authentication & Role Lifecycle Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Student Registration Lifecycle', () => {
    it('creates user without issuing session and triggers email verification', async () => {
      const mockUniversity = { id: 'uni-1', domain: 'university.edu', isActive: true };
      vi.spyOn(prisma.university, 'findFirst').mockResolvedValue(mockUniversity as any);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(passwordService, 'hash').mockResolvedValue('hashed-password');

      const mockCreatedUser = {
        id: 'student-1',
        email: 'student@university.edu',
        name: 'Test Student',
        roleId: 'STUDENT',
        role: { name: 'STUDENT' },
        universityId: 'uni-1',
        university: { id: 'uni-1', name: 'Demo Uni', slug: 'demo', domain: 'demo.edu', isActive: true },
        isActive: true,
        verified: false,
        verificationStatus: 'PENDING',
        needPasswordChange: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(userRepository, 'create').mockResolvedValue(mockCreatedUser as any);
      vi.spyOn(passwordResetService, 'requestEmailVerification').mockResolvedValue({
        success: true,
        message: 'Email sent',
        deliveredViaSmtp: false,
      } as any);

      const result = await authService.register({
        email: 'student@university.edu',
        password: 'Password123!',
        name: 'Test Student',
        role: 'STUDENT',
      });

      expect(result.user.id).toBe('student-1');
      expect(result.user.email).toBe('student@university.edu');
      // Verify no tokens/session are returned in registration payload
      expect((result as any).accessToken).toBeUndefined();
      expect((result as any).refreshToken).toBeUndefined();
      expect(passwordResetService.requestEmailVerification).toHaveBeenCalledWith('student-1');
    });
  });

  describe('Login Authorization Gates', () => {
    it('blocks login when account is suspended or inactive', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
        id: 'user-inactive',
        email: 'suspended@example.com',
        isActive: false,
        university: { isActive: true },
      } as any);

      await expect(
        authService.login('suspended@example.com', 'Password123!'),
      ).rejects.toThrow('Your account has been suspended or deactivated');
    });

    it('blocks login when email is not verified', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
        id: 'user-unverified',
        email: 'unverified@example.com',
        passwordHash: 'dummy-hash',
        isActive: true,
        verified: false,
        university: { isActive: true },
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);

      await expect(
        authService.login('unverified@example.com', 'Password123!'),
      ).rejects.toThrow('Your email address has not been verified');
    });

    it('blocks alumni login when verification status is REJECTED', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
        id: 'alumni-rejected',
        email: 'rejected@example.com',
        passwordHash: 'dummy-hash',
        isActive: true,
        verified: true,
        roleId: 'ALUMNI',
        role: { name: 'ALUMNI' },
        verificationStatus: 'REJECTED',
        university: { isActive: true },
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);

      await expect(
        authService.login('rejected@example.com', 'Password123!'),
      ).rejects.toThrow('Your alumni accreditation was rejected');
    });

    it('blocks alumni login when verification status is PENDING administrator review', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
        id: 'alumni-pending',
        email: 'pending@example.com',
        passwordHash: 'dummy-hash',
        isActive: true,
        verified: true,
        roleId: 'ALUMNI',
        role: { name: 'ALUMNI' },
        verificationStatus: 'PENDING',
        university: { isActive: true },
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);

      await expect(
        authService.login('pending@example.com', 'Password123!'),
      ).rejects.toThrow('Your alumni registration is awaiting administrative verification');
    });

    it('allows alumni login when verification status is APPROVED and credentials are valid', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedByEmail').mockResolvedValue({
        id: 'alumni-approved',
        email: 'approved@example.com',
        passwordHash: 'hashed-pw',
        isActive: true,
        verified: true,
        roleId: 'ALUMNI',
        role: { name: 'ALUMNI' },
        verificationStatus: 'APPROVED',
        universityId: 'uni-1',
        university: { id: 'uni-1', name: 'Demo Uni', slug: 'demo', domain: 'demo.edu', isActive: true },
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);
      vi.spyOn(tokenRepository, 'create').mockResolvedValue({
        id: 'session-1',
        tokenHash: 'hash',
        userId: 'alumni-approved',
        universityId: 'uni-1',
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await authService.login('approved@example.com', 'Password123!');

      expect(result.user.id).toBe('alumni-approved');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
    });
  });

  describe('Student vs Alumni Email Verification Behaviour', () => {
    it('sets STUDENT verificationStatus to APPROVED on email verification', async () => {
      const rawToken = 'student-token-123';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'tok-1',
        tokenHash,
        userId: 'student-1',
        type: 'EMAIL_VERIFICATION',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10000),
        user: {
          id: 'student-1',
          roleId: 'STUDENT',
          email: 'student@example.com',
          universityId: 'uni-1',
        },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'student-1',
        role: { name: 'STUDENT' },
      } as any);

      const updateSpy = vi.fn().mockResolvedValue({});
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          user: { update: updateSpy },
          verificationToken: { update: vi.fn().mockResolvedValue({}) },
        });
      });
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const res = await passwordResetService.verifyEmail(rawToken);

      expect(res.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'student-1' },
        data: {
          verified: true,
          verificationStatus: 'APPROVED',
        },
      });
    });

    it('leaves ALUMNI verificationStatus as PENDING on email verification', async () => {
      const rawToken = 'alumni-token-123';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'tok-2',
        tokenHash,
        userId: 'alumni-1',
        type: 'EMAIL_VERIFICATION',
        consumedAt: null,
        expiresAt: new Date(Date.now() + 10000),
        user: {
          id: 'alumni-1',
          roleId: 'ALUMNI',
          email: 'alumni@example.com',
          universityId: 'uni-1',
        },
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'alumni-1',
        role: { name: 'ALUMNI' },
      } as any);

      const updateSpy = vi.fn().mockResolvedValue({});
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          user: { update: updateSpy },
          verificationToken: { update: vi.fn().mockResolvedValue({}) },
        });
      });
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const res = await passwordResetService.verifyEmail(rawToken);

      expect(res.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'alumni-1' },
        data: {
          verified: true,
        },
      });
    });
  });

  describe('Moderator Invitation & Activation Lifecycle', () => {
    it('creates moderator invitation with SHA-256 token and dispatches email', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.moderatorInvitation, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.university, 'findFirst').mockResolvedValue({
        id: 'uni-1',
        name: 'Demo University',
        domain: 'demo.edu',
        isActive: true,
      } as any);

      vi.spyOn(prisma.moderatorInvitation, 'upsert').mockResolvedValue({
        id: 'inv-1',
        email: 'mod@university.edu',
        role: 'MODERATOR',
        invitedById: 'admin-1',
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      } as any);

      vi.spyOn(emailService, 'sendModeratorInvitationEmail').mockResolvedValue({
        success: true,
        deliveredViaSmtp: false,
        token: 'xyz',
        setupUrl: 'http://localhost:3000/setup-account?token=xyz',
      });
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const res = await adminService.inviteModerator(
        { email: 'mod@university.edu', actorId: 'admin-1' },
      );

      expect(res.id).toBe('inv-1');
      expect(prisma.moderatorInvitation.upsert).toHaveBeenCalled();
      expect(emailService.sendModeratorInvitationEmail).toHaveBeenCalled();
    });

    it('completes account setup using valid invitation token', async () => {
      const rawToken = 'valid-setup-token';
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      vi.spyOn(prisma.moderatorInvitation, 'findUnique').mockResolvedValue({
        id: 'inv-123',
        email: 'invited.mod@university.edu',
        tokenHash,
        role: 'MODERATOR',
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 3600000),
      } as any);

      vi.spyOn(prisma.university, 'findFirst').mockResolvedValue({
        id: 'uni-1',
        name: 'Demo Uni',
        slug: 'demo',
        domain: 'university.edu',
        isActive: true,
      } as any);

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.role, 'findUniqueOrThrow').mockResolvedValue({ id: 'role-mod-id', name: 'MODERATOR' } as any);
      vi.spyOn(passwordService, 'hash').mockResolvedValue('hashed-mod-pw');

      const createdModUser = {
        id: 'mod-new-1',
        name: 'Moderator User',
        email: 'invited.mod@university.edu',
        roleId: 'MODERATOR',
        role: { name: 'MODERATOR' },
        universityId: 'uni-1',
        university: { id: 'uni-1', name: 'Demo Uni', slug: 'demo', domain: 'university.edu', isActive: true },
        isActive: true,
        verified: true,
        verificationStatus: 'APPROVED',
        needPasswordChange: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const modInvitationUpdateSpy = vi.fn().mockResolvedValue({});
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        return callback({
          user: { create: vi.fn().mockResolvedValue(createdModUser) },
          moderatorInvitation: { update: modInvitationUpdateSpy },
        });
      });
      vi.spyOn(tokenRepository, 'create').mockResolvedValue({
        id: 'session-mod-1',
        tokenHash: 'hash',
        userId: 'mod-new-1',
        universityId: 'uni-1',
        expiresAt: new Date(Date.now() + 600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const result = await authService.setupAccount({
        token: rawToken,
        name: 'Moderator User',
        password: 'Password123!',
      });

      expect(result.user.id).toBe('mod-new-1');
      expect(result.user.role).toBe('MODERATOR');
      expect(modInvitationUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-123' },
          data: expect.objectContaining({ acceptedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('Change Password Lifecycle', () => {
    it('verifies current password, updates hash, resets needPasswordChange, and revokes sessions', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-change-pw',
        passwordHash: 'old-hash',
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);
      vi.spyOn(passwordService, 'hash').mockResolvedValue('new-hash');
      vi.spyOn(prisma.user, 'update').mockResolvedValue({ id: 'user-change-pw' } as any);
      vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as any);
      vi.spyOn(auditLogRepository, 'record').mockResolvedValue({} as any);

      const result = await authService.changePassword(
        'user-change-pw',
        'OldPassword123!',
        'NewPassword123!',
      );

      expect(result.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-change-pw' },
        data: {
          passwordHash: 'new-hash',
          needPasswordChange: false,
        },
      });
      expect(tokenRepository.revokeByUserId).toHaveBeenCalledWith('user-change-pw');
    });

    it('rejects password change if current password does not match', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-change-pw',
        passwordHash: 'old-hash',
      } as any);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(false);

      await expect(
        authService.changePassword('user-change-pw', 'WrongOldPassword!', 'NewPassword123!'),
      ).rejects.toThrow('Current password does not match records.');
    });
  });
});
