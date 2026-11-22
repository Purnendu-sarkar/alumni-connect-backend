import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionService } from '../../src/services/session/session.service.js';
import { sessionRepository } from '../../src/repositories/session.repository.js';
import { accountService } from '../../src/services/account/account.service.js';
import { accountRepository } from '../../src/repositories/account.repository.js';
import { authService } from '../../src/services/auth/auth.service.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { privacyService } from '../../src/services/privacy/privacy.service.js';
import { privacyRepository } from '../../src/repositories/privacy.repository.js';
import { adminService } from '../../src/services/admin/admin.service.js';
import { adminRepository } from '../../src/repositories/admin.repository.js';
import { tokenRepository } from '../../src/repositories/token.repository.js';
import { passwordService } from '../../src/services/auth/password.service.js';
import { cacheService } from '../../src/services/cache/cache.service.js';

describe('Feature 14 & 15: Sessions, Login History, Account Lifecycle & Governance Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'audit-1' } as never);
    vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(2);
    vi.spyOn(cacheService, 'set').mockResolvedValue();
    vi.spyOn(cacheService, 'del').mockResolvedValue();
  });

  describe('Session Management (sessionService)', () => {
    it('lists active sessions with current session identification and IP masking', async () => {
      const mockSessions = [
        {
          id: 'sess-1',
          userId: 'user-1',
          universityId: 'uni-1',
          tokenHash: 'hash-1',
          familyId: 'fam-1',
          replacedByTokenHash: null,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
          ipAddress: '103.114.98.42',
          deviceName: 'Chrome on Windows',
          lastActiveAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          createdAt: new Date(),
        },
        {
          id: 'sess-2',
          userId: 'user-1',
          universityId: 'uni-1',
          tokenHash: 'hash-2',
          familyId: 'fam-2',
          replacedByTokenHash: null,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)',
          ipAddress: '103.114.98.50',
          deviceName: 'Safari on iPhone',
          lastActiveAt: new Date(Date.now() - 3600000),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          createdAt: new Date(),
        },
      ];

      vi.spyOn(sessionRepository, 'findActiveByUserId').mockResolvedValue(mockSessions as never);

      const result = await sessionService.listActiveSessions('user-1', 'sess-1');

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('sess-1');
      expect(result[0]!.isCurrent).toBe(true);
      expect(result[0]!.maskedIp).toBe('103.114.*.*');
      expect(result[1]!.id).toBe('sess-2');
      expect(result[1]!.isCurrent).toBe(false);
    });

    it('successfully revokes an active session owned by the user and logs audit', async () => {
      vi.spyOn(sessionRepository, 'findById').mockResolvedValue({
        id: 'sess-target',
        userId: 'user-1',
        revokedAt: null,
        deviceName: 'Chrome on Windows',
        ipAddress: '103.114.98.42',
      } as never);
      const revokeSpy = vi.spyOn(sessionRepository, 'revoke').mockResolvedValue({ count: 1 } as never);

      const result = await sessionService.revokeSession('user-1', 'uni-1', 'sess-target');

      expect(result.success).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith('sess-target');
    });

    it('rejects cross-user session revocation (IDOR protection)', async () => {
      vi.spyOn(sessionRepository, 'findById').mockResolvedValue({
        id: 'sess-other',
        userId: 'attacker-victim-99',
        revokedAt: null,
      } as never);

      await expect(
        sessionService.revokeSession('user-1', 'uni-1', 'sess-other'),
      ).rejects.toThrow('Active session not found or already terminated.');
    });

    it('revokes all other sessions preserving the current session', async () => {
      const revokeOthersSpy = vi
        .spyOn(sessionRepository, 'revokeOthers')
        .mockResolvedValue({ count: 3 } as never);

      const result = await sessionService.revokeOtherSessions('user-1', 'uni-1', 'sess-current');

      expect(result.revokedCount).toBe(3);
      expect(revokeOthersSpy).toHaveBeenCalledWith('user-1', 'sess-current');
    });
  });

  describe('Login History (authService.getLoginHistory)', () => {
    it('returns formatted login activity with masked IP and device names', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'LOGIN_SUCCESS',
          result: 'SUCCESS' as const,
          ip: '103.114.98.42',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
          createdAt: new Date(),
        },
        {
          id: 'log-2',
          action: 'LOGIN_FAILED',
          result: 'FAILURE' as const,
          ip: '185.220.101.5',
          userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Firefox/132.0',
          createdAt: new Date(),
        },
      ];

      vi.spyOn(auditLogRepository, 'findLoginHistoryForUser').mockResolvedValue(mockLogs as never);

      const result = await authService.getLoginHistory('user-1', 10);

      expect(result).toHaveLength(2);
      expect(result[0]!.action).toBe('LOGIN_SUCCESS');
      expect(result[0]!.result).toBe('SUCCESS');
      expect(result[0]!.maskedIp).toBe('103.114.*.*');
      expect(result[0]!.deviceName).toBe('Chrome on Windows');
      expect(result[1]!.action).toBe('LOGIN_FAILED');
      expect(result[1]!.result).toBe('FAILURE');
      expect(result[1]!.deviceName).toBe('Firefox on Linux');
    });
  });

  describe('Privacy Reset Defaults (privacyService.resetPrivacyDefaults)', () => {
    it('resets privacy setting fields to institutional defaults and invalidates cache', async () => {
      const mockReset = {
        id: 'priv-1',
        userId: 'user-1',
        profileVisibility: 'ALL_MEMBERS',
        emailVisibility: 'CONNECTIONS_ONLY',
        phoneVisibility: 'CONNECTIONS_ONLY',
        locationVisibility: 'ALL_MEMBERS',
        careerVisibility: 'ALL_MEMBERS',
        educationVisibility: 'ALL_MEMBERS',
        skillsVisibility: 'ALL_MEMBERS',
        connectionsVisibility: 'CONNECTIONS_ONLY',
        mentorshipVisibility: 'ALL_MEMBERS',
        searchVisibility: 'ALL_MEMBERS',
        messagingPermission: 'CONNECTIONS_ONLY',
      };

      vi.spyOn(privacyRepository, 'resetDefaults').mockResolvedValue(mockReset as never);
      const cacheBumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(3);

      const result = await privacyService.resetPrivacyDefaults('user-1', 'uni-1');

      expect(result.profileVisibility).toBe('ALL_MEMBERS');
      expect(result.messagingPermission).toBe('CONNECTIONS_ONLY');
      expect(cacheBumpSpy).toHaveBeenCalledWith('dir');
    });
  });

  describe('Account Lifecycle (accountService)', () => {
    it('returns full account summary with university and recent export history', async () => {
      const mockAccount = {
        id: 'user-1',
        name: 'Soumya Miah',
        email: '2022101013@nwu.ac.bd',
        role: { name: 'STUDENT' },
        isActive: true,
        verified: true,
        verificationStatus: 'APPROVED',
        university: { id: 'uni-1', name: 'North Western University', domain: 'nwu.ac.bd' },
        deactivatedAt: null,
        deletionRequestedAt: null,
        createdAt: new Date(),
        dataExports: [
          {
            id: 'exp-1',
            status: 'COMPLETED',
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
          },
        ],
      };

      vi.spyOn(accountRepository, 'findAccountUser').mockResolvedValue(mockAccount as never);

      const result = await accountService.getAccountSummary('user-1');

      expect(result.name).toBe('Soumya Miah');
      expect(result.role).toBe('STUDENT');
      expect(result.recentExports).toHaveLength(1);
    });

    it('compiles personal data export and enforces 1-hour rate limit', async () => {
      vi.spyOn(accountRepository, 'findRecentDataExport').mockResolvedValue(null);
      vi.spyOn(accountRepository, 'compileSanitizedUserData').mockResolvedValue({
        account: { id: 'user-1', name: 'Soumya Miah' },
      } as never);
      vi.spyOn(accountRepository, 'createDataExportRequest').mockResolvedValue({
        id: 'exp-new',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      } as never);

      const result = await accountService.requestDataExport('user-1', 'uni-1');

      expect(result.exportId).toBe('exp-new');
      expect(result.data).toBeDefined();

      // Second request within 1 hour throws 429
      vi.spyOn(accountRepository, 'findRecentDataExport').mockResolvedValue({ id: 'exp-new' } as never);

      await expect(accountService.requestDataExport('user-1', 'uni-1')).rejects.toThrow(
        'You have requested a data export recently.',
      );
    });

    it('deactivates account with password verification and session revocation', async () => {
      vi.spyOn(accountRepository, 'findUserWithPassword').mockResolvedValue({
        id: 'user-1',
        email: 'test@nwu.ac.bd',
        name: 'Test User',
        passwordHash: '$argon2id$mock-hash',
        universityId: 'uni-1',
      } as never);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);
      const deactSpy = vi.spyOn(accountRepository, 'deactivateUser').mockResolvedValue({} as never);
      const revokeSpy = vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as never);

      const result = await accountService.deactivateAccount('user-1', 'uni-1', 'ValidPass123!@#');

      expect(result.success).toBe(true);
      expect(deactSpy).toHaveBeenCalledWith('user-1');
      expect(revokeSpy).toHaveBeenCalledWith('user-1');
    });

    it('rejects deactivation when current password is invalid', async () => {
      vi.spyOn(accountRepository, 'findUserWithPassword').mockResolvedValue({
        id: 'user-1',
        passwordHash: '$argon2id$mock-hash',
      } as never);
      vi.spyOn(passwordService, 'verify').mockResolvedValue(false);

      await expect(
        accountService.deactivateAccount('user-1', 'uni-1', 'WrongPassword123!'),
      ).rejects.toThrow('Current password does not match records.');
    });

    it('schedules account deletion with 30-day grace period, closes jobs, and revokes sessions', async () => {
      vi.spyOn(accountRepository, 'findUserWithPassword').mockResolvedValue({
        id: 'user-1',
        passwordHash: '$argon2id$mock-hash',
      } as never);

      vi.spyOn(passwordService, 'verify').mockResolvedValue(true);
      const deleteReqSpy = vi.spyOn(accountRepository, 'requestUserDeletion').mockResolvedValue({} as never);
      const closeJobsSpy = vi.spyOn(accountRepository, 'closeUserJobs').mockResolvedValue({ count: 1 } as never);
      const revokeSpy = vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as never);

      const result = await accountService.deleteAccount('user-1', 'uni-1', 'ValidPass123!@#', 'DELETE');

      expect(result.success).toBe(true);
      expect(result.gracePeriodDays).toBe(30);
      expect(deleteReqSpy).toHaveBeenCalledWith('user-1');
      expect(closeJobsSpy).toHaveBeenCalledWith('user-1');
      expect(revokeSpy).toHaveBeenCalledWith('user-1');
    });

    it('rejects deletion when confirmText is not DELETE', async () => {
      await expect(
        accountService.deleteAccount('user-1', 'uni-1', 'ValidPass123!@#', 'CANCEL'),
      ).rejects.toThrow("You must type 'DELETE' exactly to confirm account deletion.");
    });
  });

  describe('Admin Governance Settings (adminService)', () => {
    it('retrieves university settings with institutional defaults', async () => {
      vi.spyOn(adminRepository, 'getUniversitySettings').mockResolvedValue({
        id: 'uni-1',
        name: 'North Western University',
        slug: 'north-western-university',
        domain: 'nwu.ac.bd',
        isActive: true,
        settings: {
          requireEmailVerification: true,
          requireAlumniVerification: true,
          sessionTimeoutMin: 90,
          maxActiveMentees: 5,
        },
      } as never);

      const result = await adminService.getSettings('uni-1');

      expect(result.universityName).toBe('North Western University');
      expect(result.sessionTimeoutMin).toBe(90);
      expect(result.requireEmailVerification).toBe(true);
      expect(result.allowedEmailDomains).toContain('nwu.ac.bd');
    });

    it('updates university governance settings, invalidates cache, and logs audit', async () => {
      vi.spyOn(adminRepository, 'getUniversitySettings').mockResolvedValue({
        id: 'uni-1',
        name: 'North Western University',
        domain: 'nwu.ac.bd',
        settings: {},
      } as never);

      const updateSpy = vi.spyOn(adminRepository, 'updateUniversitySettings').mockResolvedValue({
        id: 'uni-1',
        name: 'North Western University Updated',
        domain: 'nwu.ac.bd',
        settings: { sessionTimeoutMin: 120 },
      } as never);

      const result = await adminService.updateSettings(
        'uni-1',
        {
          universityName: 'North Western University Updated',
          sessionTimeoutMin: 120,
        },
        'admin-1',
      );

      expect(result.universityName).toBe('North Western University Updated');
      expect(result.sessionTimeoutMin).toBe(120);
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});
