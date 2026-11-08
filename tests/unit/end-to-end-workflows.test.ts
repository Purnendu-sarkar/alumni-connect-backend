import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Role, TokenType, UserStatus, VerificationStatus } from '@prisma/client';

import { authService } from '../../src/services/auth/auth.service.js';
import { adminService } from '../../src/services/admin/admin.service.js';
import { bootstrapPlatform } from '../../src/services/bootstrap/bootstrap.service.js';
import { emailService } from '../../src/services/email/email.service.js';
import { prisma } from '../../src/config/database.js';
import { auditLogModel } from '../../src/models/audit-log.model.js';
import { passwordService } from '../../src/services/auth/password.service.js';

describe('End-to-End Mission-Critical Workflows (Workflows A - F)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailService.clearCapturedEmails();
    vi.spyOn(auditLogModel, 'record').mockResolvedValue({} as any);
  });

  // =========================================================================
  // WORKFLOW A: First Super Admin End-to-End
  // =========================================================================
  describe('Workflow A: First Super Admin Initialization, Setup & Login', () => {
    it('executes full journey from zero admin to active logged-in super admin', async () => {
      // Step 1: Backend starts, no Super Admin exists
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      let capturedPlainToken = '';
      const sendEmailSpy = vi
        .spyOn(emailService, 'sendAccountSetupEmail')
        .mockImplementation(async (to, name, token) => {
          capturedPlainToken = token;
          return {
            success: true,
            deliveredViaSmtp: true,
            token,
            setupUrl: `http://localhost:3000/setup-account?token=${token}`,
          };
        });

      const superAdminId = '11111111-1111-4111-8111-111111111111';
      const createdAdmin = {
        id: superAdminId,
        email: 'admin@nwu.ac.bd',
        role: Role.SUPER_ADMIN,
        status: UserStatus.PENDING_SETUP,
        verificationStatus: VerificationStatus.NOT_REQUIRED,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(createdAdmin),
          },
          profile: { create: vi.fn().mockResolvedValue({ fullName: 'Platform Super Admin' }) },
          privacySetting: { create: vi.fn().mockResolvedValue({}) },
          verificationToken: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      // Execute bootstrap
      await bootstrapPlatform();
      expect(sendEmailSpy).toHaveBeenCalled();
      expect(capturedPlainToken.length).toBe(64); // 32 bytes hex = 64 characters

      // Step 2: Super Admin clicks link and validates token on frontend
      const tokenRecordInDb = {
        id: 'token-rec-1',
        tokenHash: 'hashed-value',
        type: TokenType.ACCOUNT_SETUP,
        usedAt: null,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        user: {
          id: superAdminId,
          email: 'admin@nwu.ac.bd',
          role: Role.SUPER_ADMIN,
          profile: { fullName: 'Platform Super Admin' },
        },
      };

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(tokenRecordInDb as any);

      const validationResult = await authService.validateSetupToken(capturedPlainToken);
      expect(validationResult.valid).toBe(true);
      expect(validationResult.email).toBe('admin@nwu.ac.bd');

      // Step 3: Super Admin submits password setup form
      let finalAdminStatus: UserStatus = UserStatus.PENDING_SETUP;
      let tokenMarkedUsed = false;
      let savedPasswordHash = '';

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            update: vi.fn().mockImplementation((args) => {
              finalAdminStatus = args.data.status;
              savedPasswordHash = args.data.passwordHash;
              return { ...createdAdmin, status: finalAdminStatus };
            }),
          },
          verificationToken: {
            update: vi.fn().mockImplementation(() => {
              tokenMarkedUsed = true;
              return {};
            }),
          },
        };
        return callback(tx);
      });

      const setupResult = await authService.setupAccount({
        token: capturedPlainToken,
        password: 'AdminPassword123!',
      });

      expect(setupResult.success).toBe(true);
      expect(finalAdminStatus).toBe(UserStatus.ACTIVE);
      expect(tokenMarkedUsed).toBe(true);

      // Step 4: Super Admin logs in with newly created password
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: superAdminId,
        email: 'admin@nwu.ac.bd',
        passwordHash: savedPasswordHash,
        status: UserStatus.ACTIVE,
        role: Role.SUPER_ADMIN,
      } as any);

      vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.loginHistory, 'create').mockResolvedValue({} as any);
      vi.spyOn(prisma.session, 'create').mockResolvedValue({
        id: 'session-id',
        familyId: 'family-id',
        refreshTokenHash: 'hash',
      } as any);

      const loginResult = await authService.login({
        email: 'admin@nwu.ac.bd',
        password: 'AdminPassword123!',
      });

      expect(loginResult.user.id).toBe(superAdminId);
      expect(loginResult.user.role).toBe(Role.SUPER_ADMIN);
      expect(loginResult.accessToken).toBeDefined();
    });
  });

  // =========================================================================
  // WORKFLOW B: Student End-to-End
  // =========================================================================
  describe('Workflow B: Student Registration, Email Verification & Dashboard Login', () => {
    it('allows student to register, verifies email, and permits login to Student Dashboard', async () => {
      const studentEmail = 'student.rahman@nwu.ac.bd';
      const studentPassword = 'StudentStrongPassword123!';
      const studentId = '22222222-2222-4222-8222-222222222222';

      // 1. Student submits registration form
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      let plainVerificationToken = '';
      vi.spyOn(emailService, 'sendVerificationEmail').mockImplementation(async (to, name, token) => {
        plainVerificationToken = token;
        return { success: true, deliveredViaSmtp: true, token, verificationUrl: 'url' };
      });

      const createdStudent = {
        id: studentId,
        email: studentEmail,
        role: Role.STUDENT,
        status: UserStatus.PENDING_EMAIL_VERIFICATION,
        verificationStatus: VerificationStatus.NOT_REQUIRED,
        universityId: 'STU-2026-999',
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValue(createdStudent) },
          profile: { create: vi.fn().mockResolvedValue({}) },
          privacySetting: { create: vi.fn().mockResolvedValue({}) },
          verificationToken: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const registered = await authService.register({
        name: 'Rahman Student',
        email: studentEmail,
        password: studentPassword,
        role: Role.STUDENT,
        department: 'Computer Science and Engineering',
        batch: '2026',
        universityId: 'STU-2026-999',
      });

      expect(registered.status).toBe(UserStatus.PENDING_EMAIL_VERIFICATION);
      expect(plainVerificationToken).toBeDefined();

      // 2. Student attempts login BEFORE email verification -> MUST FAIL (403)
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(createdStudent as any);

      await expect(
        authService.login({ email: studentEmail, password: studentPassword }),
      ).rejects.toThrow(/institutional email has not been verified/);

      // 3. Student clicks verification link in email -> transitions to ACTIVE
      const tokenRecord = {
        id: 'tok-rec-stu',
        tokenHash: 'hashed',
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: { id: studentId, role: Role.STUDENT },
      };

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(tokenRecord as any);

      let studentUpdatedStatus = UserStatus.PENDING_EMAIL_VERIFICATION;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            update: vi.fn().mockImplementation((args) => {
              studentUpdatedStatus = args.data.status;
              return { ...createdStudent, status: studentUpdatedStatus };
            }),
          },
          verificationToken: { update: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const verificationResult = await authService.verifyEmail(plainVerificationToken);
      expect(verificationResult.success).toBe(true);
      expect(studentUpdatedStatus).toBe(UserStatus.ACTIVE);

      // 4. Student logs in AFTER email verification -> MUST SUCCEED
      const hashedPassword = await passwordService.hash(studentPassword);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: studentId,
        email: studentEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        role: Role.STUDENT,
      } as any);

      vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.loginHistory, 'create').mockResolvedValue({} as any);
      vi.spyOn(prisma.session, 'create').mockResolvedValue({
        id: 'sess-stu',
        familyId: 'fam-stu',
        refreshTokenHash: 'hash',
      } as any);

      const loginSuccess = await authService.login({ email: studentEmail, password: studentPassword });
      expect(loginSuccess.user.id).toBe(studentId);
      expect(loginSuccess.user.role).toBe(Role.STUDENT);
    });
  });

  // =========================================================================
  // WORKFLOW C: Alumni End-to-End with Admin Approval
  // =========================================================================
  describe('Workflow C: Alumni Registration, Verification, Admin Approval & Login', () => {
    it('requires admin review after email verification before alumni dashboard access is granted', async () => {
      const alumniEmail = 'alumni.hasan@nwu.ac.bd';
      const alumniPassword = 'AlumniPassword2022!';
      const alumniId = '33333333-3333-4333-8333-333333333333';

      // 1. Alumni registers
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      let plainToken = '';
      vi.spyOn(emailService, 'sendVerificationEmail').mockImplementation(async (to, name, token) => {
        plainToken = token;
        return { success: true, deliveredViaSmtp: true, token, verificationUrl: 'url' };
      });

      const createdAlumni = {
        id: alumniId,
        email: alumniEmail,
        role: Role.ALUMNI,
        status: UserStatus.PENDING_EMAIL_VERIFICATION,
        verificationStatus: VerificationStatus.PENDING,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: { create: vi.fn().mockResolvedValue(createdAlumni) },
          profile: { create: vi.fn().mockResolvedValue({}) },
          privacySetting: { create: vi.fn().mockResolvedValue({}) },
          verificationToken: { create: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      await authService.register({
        name: 'Hasan Alumnus',
        email: alumniEmail,
        password: alumniPassword,
        role: Role.ALUMNI,
        department: 'BBA',
        graduationYear: 2022,
        universityId: 'ALU-2022-101',
      });

      // 2. Alumni verifies email -> transitions to PENDING_ADMIN_VERIFICATION (NOT active yet!)
      const tokenRecord = {
        id: 'tok-alu',
        tokenHash: 'hashed',
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        user: { id: alumniId, role: Role.ALUMNI },
      };

      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(tokenRecord as any);

      let alumniStatus = UserStatus.PENDING_EMAIL_VERIFICATION;
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          user: {
            update: vi.fn().mockImplementation((args) => {
              alumniStatus = args.data.status;
              return { ...createdAlumni, status: alumniStatus };
            }),
          },
          verificationToken: { update: vi.fn().mockResolvedValue({}) },
        };
        return callback(tx);
      });

      const verifyRes = await authService.verifyEmail(plainToken);
      expect(verifyRes.status).toBe(UserStatus.PENDING_ADMIN_VERIFICATION);
      expect(alumniStatus).toBe(UserStatus.PENDING_ADMIN_VERIFICATION);

      // 3. Alumni attempts login while PENDING_ADMIN_VERIFICATION -> MUST FAIL (403)
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: alumniId,
        email: alumniEmail,
        status: UserStatus.PENDING_ADMIN_VERIFICATION,
      } as any);

      await expect(
        authService.login({ email: alumniEmail, password: alumniPassword }),
      ).rejects.toThrow(/pending administrator review/);

      // 4. Super Admin reviews and APPROVES Alumni application
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: alumniId,
        email: alumniEmail,
        role: Role.ALUMNI,
        profile: { fullName: 'Hasan Alumnus' },
      } as any);

      const approvalEmailSpy = vi
        .spyOn(emailService, 'sendAlumniApprovalEmail')
        .mockResolvedValue({ success: true, deliveredViaSmtp: true });

      vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: alumniId,
        email: alumniEmail,
        status: UserStatus.ACTIVE,
        verificationStatus: VerificationStatus.APPROVED,
      } as any);

      const reviewed = await adminService.reviewVerification({
        userId: alumniId,
        reviewerId: '55555555-5555-4555-8555-555555555555',
        status: 'APPROVED',
      });

      expect(reviewed.status).toBe(UserStatus.ACTIVE);
      expect(approvalEmailSpy).toHaveBeenCalledWith(alumniEmail, 'Hasan Alumnus');

      // 5. Alumni logs in AFTER approval -> MUST SUCCEED
      const hashedPassword = await passwordService.hash(alumniPassword);
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: alumniId,
        email: alumniEmail,
        passwordHash: hashedPassword,
        status: UserStatus.ACTIVE,
        role: Role.ALUMNI,
      } as any);

      vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      vi.spyOn(prisma.loginHistory, 'create').mockResolvedValue({} as any);
      vi.spyOn(prisma.session, 'create').mockResolvedValue({
        id: 'sess-alu',
        familyId: 'fam-alu',
        refreshTokenHash: 'hash',
      } as any);

      const alumniLogin = await authService.login({ email: alumniEmail, password: alumniPassword });
      expect(alumniLogin.user.id).toBe(alumniId);
      expect(alumniLogin.user.role).toBe(Role.ALUMNI);
    });
  });

  // =========================================================================
  // WORKFLOW D: Alumni Rejection Lifecycle
  // =========================================================================
  describe('Workflow D: Alumni Rejection by Super Admin', () => {
    it('sets status to VERIFICATION_REJECTED, sends rejection email with reason, and blocks login', async () => {
      const applicantId = '44444444-4444-4444-8444-444444444444';
      const applicantEmail = 'rejected.applicant@nwu.ac.bd';
      const reason = 'Provided student ID does not match registrar database records for 2020.';

      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: applicantId,
        email: applicantEmail,
        role: Role.ALUMNI,
        profile: { fullName: 'Rejected Person' },
      } as any);

      const rejectionEmailSpy = vi
        .spyOn(emailService, 'sendAlumniRejectionEmail')
        .mockResolvedValue({ success: true, deliveredViaSmtp: true });

      vi.spyOn(prisma.user, 'update').mockResolvedValue({
        id: applicantId,
        email: applicantEmail,
        status: UserStatus.VERIFICATION_REJECTED,
        verificationStatus: VerificationStatus.REJECTED,
        verificationNote: reason,
      } as any);

      const reviewed = await adminService.reviewVerification({
        userId: applicantId,
        reviewerId: '55555555-5555-4555-8555-555555555555',
        status: 'REJECTED',
        reason,
      });

      expect(reviewed.status).toBe(UserStatus.VERIFICATION_REJECTED);
      expect(rejectionEmailSpy).toHaveBeenCalledWith(applicantEmail, 'Rejected Person', reason);

      // Login attempt must be strictly blocked with the specific rejection reason
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: applicantId,
        email: applicantEmail,
        status: UserStatus.VERIFICATION_REJECTED,
        verificationNote: reason,
      } as any);

      await expect(
        authService.login({ email: applicantEmail, password: 'AnyPassword123!' }),
      ).rejects.toThrow(/rejected by platform administration/);
    });
  });

  // =========================================================================
  // WORKFLOW E: Backend Restart Idempotency
  // =========================================================================
  describe('Workflow E: Backend Restart Idempotency', () => {
    it('detects existing super admin upon restart and does not duplicate account or email', async () => {
      vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({
        id: 'existing-root-admin',
        email: 'root@nwu.ac.bd',
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      } as any);

      const createSpy = vi.spyOn(prisma.user, 'create');
      const emailSpy = vi.spyOn(emailService, 'sendAccountSetupEmail');

      await bootstrapPlatform();

      expect(createSpy).not.toHaveBeenCalled();
      expect(emailSpy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // WORKFLOW F: Invalid, Expired, and Reused Tokens
  // =========================================================================
  describe('Workflow F: Token Safety, Expiration & Replay Attack Defense', () => {
    it('rejects an expired email verification token', async () => {
      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'exp-tok-1',
        tokenHash: 'hashed',
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000), // Expired in the past
        user: { id: 'u1', role: Role.STUDENT },
      } as any);

      await expect(authService.verifyEmail('expired-token')).rejects.toThrow(
        /This verification link has expired/,
      );
    });

    it('rejects an already-used email verification token', async () => {
      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'used-tok-1',
        tokenHash: 'hashed',
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: new Date(Date.now() - 5000), // Already used
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'u1', role: Role.STUDENT },
      } as any);

      await expect(authService.verifyEmail('used-token')).rejects.toThrow(
        /This verification link has already been used/,
      );
    });

    it('rejects an unrecognized or tampered setup token', async () => {
      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue(null);

      await expect(authService.validateSetupToken('random-invalid-token')).rejects.toThrow(
        /Invalid or unrecognized account setup link/,
      );
    });

    it('rejects an already-consumed setup token during account setup', async () => {
      vi.spyOn(prisma.verificationToken, 'findUnique').mockResolvedValue({
        id: 'used-setup-1',
        tokenHash: 'hashed',
        type: TokenType.ACCOUNT_SETUP,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 'admin-id' },
      } as any);

      await expect(
        authService.setupAccount({ token: 'used-setup-tok', password: 'NewPassword123!' }),
      ).rejects.toThrow(/This account setup link has already been used/);
    });
  });
});
