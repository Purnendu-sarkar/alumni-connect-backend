import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, UserStatus, VerificationStatus } from '@prisma/client';

import { emailService } from '../../src/services/email/email.service.js';
import { adminService } from '../../src/services/admin/admin.service.js';
import { prisma } from '../../src/config/database.js';
import { auditLogModel } from '../../src/models/audit-log.model.js';

describe('Gmail SMTP Architecture & Email Service', () => {
  beforeEach(() => {
    emailService.clearCapturedEmails();
    vi.restoreAllMocks();
  });

  it('provides a safe verifyEmailTransport diagnostic method that handles missing auth gracefully', async () => {
    const verified = await emailService.verifyEmailTransport();
    expect(typeof verified).toBe('boolean');
  });

  it('dispatches and captures account setup email with secure tokens', async () => {
    const result = await emailService.sendAccountSetupEmail(
      'admin.candidate@nwu.ac.bd',
      'Dr. Jane Smith',
      'test-secure-setup-token-12345',
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe('test-secure-setup-token-12345');
    expect(result.setupUrl).toContain('/setup-account?token=test-secure-setup-token-12345');

    const captured = emailService.getCapturedEmails();
    expect(captured.length).toBe(1);
    expect(captured[0].to).toBe('admin.candidate@nwu.ac.bd');
    expect(captured[0].subject).toContain('Super Admin');
    expect(captured[0].html).toContain('Super Administrator');
    expect(captured[0].html).toContain('48 hours');
  });

  it('dispatches and captures moderator invitation email with inviter name', async () => {
    const result = await emailService.sendModeratorInvitationEmail(
      'mod@nwu.ac.bd',
      'Mod Candidate',
      'mod-token-xyz',
      'Super Admin John',
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe('mod-token-xyz');
    expect(result.setupUrl).toContain('/setup-account?token=mod-token-xyz');

    const captured = emailService.getCapturedEmails();
    expect(captured.length).toBe(1);
    expect(captured[0].subject).toContain('Moderator Role');
    expect(captured[0].html).toContain('Super Admin John');
  });

  it('dispatches and captures super admin invitation email', async () => {
    const result = await emailService.sendSuperAdminInvitationEmail(
      'admin2@nwu.ac.bd',
      'Second Admin',
      'admin2-token-abc',
      'First Super Admin',
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe('admin2-token-abc');

    const captured = emailService.getCapturedEmails();
    expect(captured.length).toBe(1);
    expect(captured[0].subject).toContain('Super Administrator Privilege');
  });

  it('dispatches alumni verification approval notification email', async () => {
    const result = await emailService.sendAlumniApprovalEmail(
      'graduate@nwu.ac.bd',
      'Rahim Ahmed',
    );

    expect(result.success).toBe(true);
    const captured = emailService.getCapturedEmails();
    expect(captured[0].subject).toContain('Approved');
    expect(captured[0].html).toContain('Sign In to Alumni Dashboard');
  });

  it('dispatches alumni verification rejection notification with reason', async () => {
    const result = await emailService.sendAlumniRejectionEmail(
      'applicant@nwu.ac.bd',
      'Applicant Name',
      'Graduation year does not match institutional records.',
    );

    expect(result.success).toBe(true);
    const captured = emailService.getCapturedEmails();
    expect(captured[0].subject).toContain('Verification Request');
    expect(captured[0].html).toContain('Graduation year does not match institutional records.');
  });

  it('dispatches security notification email for account events', async () => {
    const result = await emailService.sendSecurityNotification(
      'user@nwu.ac.bd',
      'Karim User',
      'New Sign-in From Unknown Device',
      'A sign-in occurred from IP 192.168.1.50 at 14:30 UTC.',
    );

    expect(result.success).toBe(true);
    const captured = emailService.getCapturedEmails();
    expect(captured[0].subject).toContain('Security Alert');
    expect(captured[0].html).toContain('New Sign-in From Unknown Device');
  });
});

describe('Super Admin Invitation Endpoints & Lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    emailService.clearCapturedEmails();
    vi.spyOn(auditLogModel, 'record').mockResolvedValue({} as any);
  });

  it('allows Super Admin to invite a MODERATOR with PENDING_SETUP and token dispatch', async () => {
    vi.spyOn(prisma.user, 'findUnique')
      .mockResolvedValueOnce(null) // Check if user already exists
      .mockResolvedValueOnce({
        id: 'super-admin-1',
        email: 'superadmin@nwu.ac.bd',
        profile: { fullName: 'Root Super Admin' },
      } as any); // Fetch inviter

    const createdUser = {
      id: 'mod-user-new',
      email: 'new.mod@nwu.ac.bd',
      role: Role.MODERATOR,
      status: UserStatus.PENDING_SETUP,
      verificationStatus: VerificationStatus.NOT_REQUIRED,
    };

    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      const txMock = {
        user: { create: vi.fn().mockResolvedValue(createdUser) },
        profile: { create: vi.fn().mockResolvedValue({}) },
        privacySetting: { create: vi.fn().mockResolvedValue({}) },
        verificationToken: { create: vi.fn().mockResolvedValue({}) },
      };
      return callback(txMock);
    });

    const result = await adminService.inviteAdmin({
      inviterId: 'super-admin-1',
      email: 'new.mod@nwu.ac.bd',
      fullName: 'New Moderator Officer',
      role: 'MODERATOR',
      department: 'Computer Science & Engineering',
    });

    expect(result.email).toBe('new.mod@nwu.ac.bd');
    expect(result.role).toBe(Role.MODERATOR);
    expect(result.status).toBe(UserStatus.PENDING_SETUP);

    const captured = emailService.getCapturedEmails();
    expect(captured.length).toBe(1);
    expect(captured[0].to).toBe('new.mod@nwu.ac.bd');
    expect(captured[0].subject).toContain('Moderator Role');
  });

  it('rejects duplicate invitations if email already exists', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce({
      id: 'existing-id',
      email: 'already.exists@nwu.ac.bd',
    } as any);

    await expect(
      adminService.inviteAdmin({
        inviterId: 'super-admin-1',
        email: 'already.exists@nwu.ac.bd',
        fullName: 'Existing Person',
        role: 'MODERATOR',
      }),
    ).rejects.toThrow('An account with this email address already exists.');
  });
});
