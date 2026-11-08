import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, TokenType, UserStatus, VerificationStatus } from '@prisma/client';

import { authService } from '../../src/services/auth/auth.service.js';
import { adminService } from '../../src/services/admin/admin.service.js';
import { prisma } from '../../src/config/database.js';
import { auditLogModel } from '../../src/models/audit-log.model.js';
import { emailService } from '../../src/services/email/email.service.js';

describe('Auth Workflow & Lifecycle State Transitions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditLogModel, 'record').mockResolvedValue({} as any);
  });

  it('registers a Student in PENDING_EMAIL_VERIFICATION and dispatches verification email', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    const mockUser = {
      id: 'student-id-1',
      email: 'student@nwu.ac.bd',
      role: Role.STUDENT,
      status: UserStatus.PENDING_EMAIL_VERIFICATION,
      verificationStatus: VerificationStatus.NOT_REQUIRED,
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: { create: vi.fn().mockResolvedValue(mockUser) },
        profile: { create: vi.fn().mockResolvedValue({}) },
        privacySetting: { create: vi.fn().mockResolvedValue({}) },
        verificationToken: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    const sendEmailSpy = vi
      .spyOn(emailService, 'sendVerificationEmail')
      .mockResolvedValue({ success: true, deliveredViaSmtp: false, token: 't', verificationUrl: 'u' });

    const result = await authService.register({
      name: 'John Student',
      email: 'student@nwu.ac.bd',
      password: 'StrongPassword123!',
      role: Role.STUDENT,
      department: 'CSE',
      batch: '2026',
      universityId: 'STU-2026-001',
    });

    expect(result.status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
    expect(sendEmailSpy).toHaveBeenCalledWith(
      'student@nwu.ac.bd',
      'John Student',
      expect.any(String),
    );
  });

  it('registers an Alumni in PENDING_EMAIL_VERIFICATION with PENDING verificationStatus', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    const mockAlumni = {
      id: 'alumni-id-1',
      email: 'alumni@nwu.ac.bd',
      role: Role.ALUMNI,
      status: UserStatus.PENDING_EMAIL_VERIFICATION,
      verificationStatus: VerificationStatus.PENDING,
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: { create: vi.fn().mockResolvedValue(mockAlumni) },
        profile: { create: vi.fn().mockResolvedValue({}) },
        privacySetting: { create: vi.fn().mockResolvedValue({}) },
        verificationToken: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    vi.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({
      success: true,
      deliveredViaSmtp: false,
      token: 't',
      verificationUrl: 'u',
    });

    const result = await authService.register({
      name: 'Jane Alum',
      email: 'alumni@nwu.ac.bd',
      password: 'StrongPassword123!',
      role: Role.ALUMNI,
      department: 'BBA',
      graduationYear: 2022,
      universityId: 'ALU-2022-045',
    });

    expect(result.status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
    expect(result.verificationStatus).toBe(VerificationStatus.PENDING);
  });

  it('activates Student immediately upon email verification', async () => {
    const mockTokenRecord = {
      id: 'token-1',
      tokenHash: 'hashed',
      type: TokenType.EMAIL_VERIFICATION,
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      user: {
        id: 'student-id-1',
        role: Role.STUDENT,
      },
    };

    vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(mockTokenRecord as any);

    let updatedStatus: any = null;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          update: vi.fn().mockImplementation((args) => {
            updatedStatus = args.data.status;
            return { id: 'student-id-1', status: updatedStatus };
          }),
        },
        verificationToken: { update: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    const result = await authService.verifyEmail('valid-plain-token');

    expect(result.success).toBe(true);
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(updatedStatus).toBe(UserStatus.ACTIVE);
  });

  it('transitions Alumni to PENDING_ADMIN_VERIFICATION upon email verification', async () => {
    const mockTokenRecord = {
      id: 'token-2',
      tokenHash: 'hashed',
      type: TokenType.EMAIL_VERIFICATION,
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      user: {
        id: 'alumni-id-1',
        role: Role.ALUMNI,
      },
    };

    vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(mockTokenRecord as any);

    let updatedStatus: any = null;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          update: vi.fn().mockImplementation((args) => {
            updatedStatus = args.data.status;
            return { id: 'alumni-id-1', status: updatedStatus };
          }),
        },
        verificationToken: { update: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    const result = await authService.verifyEmail('valid-plain-token');

    expect(result.success).toBe(true);
    expect(result.status).toBe(UserStatus.PENDING_ADMIN_VERIFICATION);
    expect(updatedStatus).toBe(UserStatus.PENDING_ADMIN_VERIFICATION);
  });

  it('completes account setup via ACCOUNT_SETUP token and sets ACTIVE status', async () => {
    const mockTokenRecord = {
      id: 'setup-tok-1',
      tokenHash: 'hashed',
      type: TokenType.ACCOUNT_SETUP,
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      user: {
        id: 'super-admin-id-1',
        email: 'superadmin@nwu.ac.bd',
        role: Role.SUPER_ADMIN,
        status: UserStatus.PENDING_SETUP,
      },
    };

    vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(mockTokenRecord as any);

    let updatedUserStatus: any = null;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const mockTx = {
        user: {
          update: vi.fn().mockImplementation((args) => {
            updatedUserStatus = args.data.status;
            return { id: 'super-admin-id-1', status: updatedUserStatus };
          }),
        },
        verificationToken: { update: vi.fn().mockResolvedValue({}) },
      };
      return callback(mockTx);
    });

    const result = await authService.setupAccount({
      token: 'valid-setup-token',
      password: 'BrandNewSecurePassword123!',
    });

    expect(result.success).toBe(true);
    expect(updatedUserStatus).toBe(UserStatus.ACTIVE);
  });

  it('prevents login when user account is PENDING_EMAIL_VERIFICATION or PENDING_ADMIN_VERIFICATION', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'unverified-id',
      email: 'pending@nwu.ac.bd',
      passwordHash: 'hash',
      status: UserStatus.PENDING_EMAIL_VERIFICATION,
    } as any);

    await expect(
      authService.login({ email: 'pending@nwu.ac.bd', password: 'AnyPassword' }),
    ).rejects.toThrow(/institutional email has not been verified/);

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'pending-admin-id',
      email: 'pendingadmin@nwu.ac.bd',
      passwordHash: 'hash',
      status: UserStatus.PENDING_ADMIN_VERIFICATION,
    } as any);

    await expect(
      authService.login({ email: 'pendingadmin@nwu.ac.bd', password: 'AnyPassword' }),
    ).rejects.toThrow(/pending administrator review/);
  });

  it('approves Alumni verification, marks ACTIVE, and dispatches approval email', async () => {
    const mockUser = {
      id: 'alumni-id-pending',
      email: 'alumni@nwu.ac.bd',
      role: Role.ALUMNI,
      status: UserStatus.PENDING_ADMIN_VERIFICATION,
      profile: { fullName: 'Alumnus Person' },
    };

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValue({
      ...mockUser,
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.APPROVED,
    } as any);

    const approvalEmailSpy = vi
      .spyOn(emailService, 'sendAlumniApprovalEmail')
      .mockResolvedValue({ success: true, deliveredViaSmtp: false });

    const updated = await adminService.reviewVerification({
      userId: 'alumni-id-pending',
      reviewerId: 'admin-id-1',
      status: 'APPROVED',
    });

    expect(updated.status).toBe(UserStatus.ACTIVE);
    expect(updated.verificationStatus).toBe(VerificationStatus.APPROVED);
    expect(approvalEmailSpy).toHaveBeenCalledWith('alumni@nwu.ac.bd', 'Alumnus Person');
  });

  it('rejects Alumni verification, marks VERIFICATION_REJECTED, and dispatches rejection email', async () => {
    const mockUser = {
      id: 'alumni-id-pending',
      email: 'fakealumni@nwu.ac.bd',
      role: Role.ALUMNI,
      status: UserStatus.PENDING_ADMIN_VERIFICATION,
      profile: { fullName: 'Fraudster' },
    };

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.user, 'update').mockResolvedValue({
      ...mockUser,
      status: UserStatus.VERIFICATION_REJECTED,
      verificationStatus: VerificationStatus.REJECTED,
    } as any);

    const rejectionEmailSpy = vi
      .spyOn(emailService, 'sendAlumniRejectionEmail')
      .mockResolvedValue({ success: true, deliveredViaSmtp: false });

    const updated = await adminService.reviewVerification({
      userId: 'alumni-id-pending',
      reviewerId: 'admin-id-1',
      status: 'REJECTED',
      reason: 'Graduation year and department record could not be found in university registry.',
    });

    expect(updated.status).toBe(UserStatus.VERIFICATION_REJECTED);
    expect(updated.verificationStatus).toBe(VerificationStatus.REJECTED);
    expect(rejectionEmailSpy).toHaveBeenCalledWith(
      'fakealumni@nwu.ac.bd',
      'Fraudster',
      expect.stringContaining('university registry'),
    );
  });
});
