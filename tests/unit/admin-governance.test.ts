import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adminService } from '../../src/services/admin/admin.service.js';
import { adminRepository } from '../../src/repositories/admin.repository.js';
import { auditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { tokenRepository } from '../../src/repositories/token.repository.js';
import { userRepository } from '../../src/repositories/user.repository.js';
import { cacheService } from '../../src/services/cache/cache.service.js';
import { emailService } from '../../src/services/email/email.service.js';
import { notificationService } from '../../src/services/notification/notification.service.js';

describe('Super Admin User Governance Service Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'audit-1' } as never);
    vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(2);
    vi.spyOn(notificationService, 'notifyUser').mockResolvedValue(null);
    vi.spyOn(emailService, 'sendVerificationDecisionEmail').mockResolvedValue({
      deliveredViaSmtp: false,
    } as never);
  });

  describe('getStats', () => {
    it('returns accurate single-university user, verification, and job KPIs', async () => {
      const mockStats = {
        scope: 'SINGLE_UNIVERSITY' as const,
        totalUsers: 42,
        totalStudents: 20,
        totalAlumni: 18,
        totalModerators: 3,
        totalAdmins: 1,
        approvedUsers: 35,
        pendingVerifications: 4,
        pendingEmailVerifications: 3,
        totalJobs: 12,
        pendingJobs: 2,
        auditLogsCount: 150,
      };

      const spy = vi.spyOn(adminRepository, 'getDashboardStats').mockResolvedValue(mockStats);

      const result = await adminService.getStats('uni-1');

      expect(spy).toHaveBeenCalledWith('uni-1');
      expect(result).toEqual(mockStats);
      expect(result.pendingVerifications).toBe(4);
      expect(result.pendingEmailVerifications).toBe(3);
      expect(result.totalJobs).toBe(12);
      expect(result.pendingJobs).toBe(2);
    });
  });

  describe('listVerifications', () => {
    it('returns both verified and unverified pending Alumni with computed signals', async () => {
      vi.spyOn(userRepository, 'listVerifications').mockResolvedValue([
        [
          {
            id: 'alu-verified',
            name: 'Ayesha Rahman',
            email: 'ayesha@nwu.edu.bd',
            studentId: 'NWU-2019-011',
            academicId: 'ACAD-101',
            verified: true,
            verificationStatus: 'PENDING',
            role: { id: 'role-alu', name: 'ALUMNI' },
            university: { domain: 'nwu.edu.bd' },
          },
          {
            id: 'alu-unverified',
            name: 'Tariq Hasan',
            email: 'tariq@gmail.com',
            studentId: 'NWU-2019-011',
            academicId: 'ACAD-202',
            verified: false,
            verificationStatus: 'PENDING',
            role: { id: 'role-alu', name: 'ALUMNI' },
            university: { domain: 'nwu.edu.bd' },
          },
        ] as never,
        2,
      ]);

      vi.spyOn(adminRepository, 'findDuplicateIdCounts').mockResolvedValue({
        studentMap: new Map([['NWU-2019-011', 2]]),
        academicMap: new Map([
          ['ACAD-101', 1],
          ['ACAD-202', 1],
        ]),
      });

      const result = await adminService.listVerifications('uni-1', {
        status: 'PENDING',
        emailVerified: 'ALL',
        page: 1,
        limit: 20,
      });

      expect(result.users).toHaveLength(2);
      expect(result.users[0]?.signals).toEqual({
        emailDomainValid: true,
        duplicateIdCount: 1,
      });
      expect(result.users[1]?.verified).toBe(false);
      expect(result.users[1]?.signals).toEqual({
        emailDomainValid: false,
        duplicateIdCount: 1,
      });
      expect(result.meta.total).toBe(2);
    });
  });

  describe('reviewVerification', () => {
    it('blocks APPROVED decision when email ownership is not verified', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'alu-unverified',
        universityId: 'uni-1',
        name: 'Pending Alumni',
        email: 'pending@nwu.edu.bd',
        verified: false,
        role: { id: 'role-alu', name: 'ALUMNI', permissions: [] },
      } as never);

      await expect(
        adminService.reviewVerification({
          userId: 'alu-unverified',
          universityId: 'uni-1',
          actorId: 'admin-1',
          status: 'APPROVED',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('approves verified Alumni, bumps dir/jobs/stories caches, and sends alumni dashboard notification', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'alu-1',
        universityId: 'uni-1',
        name: 'Verified Alumni',
        email: 'verified@nwu.edu.bd',
        verified: true,
        role: { id: 'role-alu', name: 'ALUMNI', permissions: [] },
      } as never);
      vi.spyOn(userRepository, 'reviewVerification').mockResolvedValue({
        id: 'alu-1',
        verificationStatus: 'APPROVED',
      } as never);
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(3);
      const notifySpy = vi.spyOn(notificationService, 'notifyUser').mockResolvedValue(null);

      await adminService.reviewVerification({
        userId: 'alu-1',
        universityId: 'uni-1',
        actorId: 'admin-1',
        status: 'APPROVED',
      });

      expect(bumpSpy).toHaveBeenCalledWith('dir');
      expect(bumpSpy).toHaveBeenCalledWith('jobs');
      expect(bumpSpy).toHaveBeenCalledWith('stories');
      expect(notifySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'alu-1',
          link: '/alumni/dashboard',
        }),
      );
    });

    it('revokes sessions and bumps caches on REJECTED/REVOKED decision', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'alu-2',
        universityId: 'uni-1',
        name: 'Flagged Alumni',
        email: 'flagged@nwu.edu.bd',
        verified: true,
        role: { id: 'role-alu', name: 'ALUMNI', permissions: [] },
      } as never);
      vi.spyOn(userRepository, 'reviewVerification').mockResolvedValue({
        id: 'alu-2',
        verificationStatus: 'REJECTED',
      } as never);
      const revokeSpy = vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as never);
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(4);

      await adminService.reviewVerification({
        userId: 'alu-2',
        universityId: 'uni-1',
        actorId: 'admin-1',
        status: 'REJECTED',
        reason: 'Graduation batch record does not match registrar archive.',
      });

      expect(revokeSpy).toHaveBeenCalledWith('alu-2');
      expect(bumpSpy).toHaveBeenCalledWith('dir');
      expect(bumpSpy).toHaveBeenCalledWith('jobs');
      expect(bumpSpy).toHaveBeenCalledWith('stories');
    });
  });

  describe('changeUserRole & toggleUserSuspension', () => {
    it('transitions STUDENT to ALUMNI, revokes sessions, bumps caches, and records ROLE_CHANGED audit log', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'stu-1',
        universityId: 'uni-1',
        name: 'Graduating Student',
        email: 'stu1@nwu.edu.bd',
        role: { id: 'role-stu', name: 'STUDENT', permissions: [] },
      } as never);
      vi.spyOn(adminRepository, 'findRoleByName').mockResolvedValue({
        id: 'role-alu',
        name: 'ALUMNI',
      } as never);
      vi.spyOn(userRepository, 'updateUserRoleTransaction').mockResolvedValue({
        id: 'stu-1',
        role: { id: 'role-alu', name: 'ALUMNI' },
        verificationStatus: 'APPROVED',
      } as never);
      const revokeSpy = vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 1 } as never);
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'audit-role' } as never);
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(5);

      const updated = await adminService.changeUserRole({
        userId: 'stu-1',
        universityId: 'uni-1',
        actorId: 'admin-1',
        role: 'ALUMNI',
        graduationYear: '2026',
        reason: 'Confirmed graduation in Spring 2026 convocation roster.',
      });

      expect(updated.role.name).toBe('ALUMNI');
      expect(revokeSpy).toHaveBeenCalledWith('stu-1');
      expect(bumpSpy).toHaveBeenCalledWith('dir');
      expect(bumpSpy).toHaveBeenCalledWith('jobs');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ROLE_CHANGED',
          targetId: 'stu-1',
          metadata: expect.objectContaining({ fromRole: 'STUDENT', toRole: 'ALUMNI' }),
        }),
      );
    });

    it('blocks self role change and blocks demoting MODERATOR or SUPER_ADMIN', async () => {
      await expect(
        adminService.changeUserRole({
          userId: 'admin-1',
          universityId: 'uni-1',
          actorId: 'admin-1',
          role: 'ALUMNI',
          reason: 'Attempting self role modification.',
        }),
      ).rejects.toMatchObject({ statusCode: 403 });

      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'mod-1',
        universityId: 'uni-1',
        name: 'Campus Moderator',
        email: 'mod@nwu.edu.bd',
        role: { id: 'role-mod', name: 'MODERATOR', permissions: [] },
      } as never);

      await expect(
        adminService.changeUserRole({
          userId: 'mod-1',
          universityId: 'uni-1',
          actorId: 'admin-1',
          role: 'ALUMNI',
          reason: 'Attempting invalid moderator role demotion.',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_ROLE_TRANSITION' });
    });

    it('blocks self-suspension and blocks suspending the last active SUPER_ADMIN with 409 LAST_SUPER_ADMIN', async () => {
      await expect(
        adminService.toggleUserSuspension({
          userId: 'admin-1',
          universityId: 'uni-1',
          actorId: 'admin-1',
          isActive: false,
          reason: 'Self suspension test should fail.',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'admin-2',
        universityId: 'uni-1',
        name: 'Sole Super Admin',
        email: 'admin2@nwu.edu.bd',
        role: { id: 'role-adm', name: 'SUPER_ADMIN', permissions: [] },
      } as never);
      vi.spyOn(adminRepository, 'countActiveSuperAdmins').mockResolvedValue(1);

      await expect(
        adminService.toggleUserSuspension({
          userId: 'admin-2',
          universityId: 'uni-1',
          actorId: 'admin-1',
          isActive: false,
          reason: 'Attempting to suspend sole active Super Admin.',
        }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_SUPER_ADMIN' });
    });
  });

  describe('listModerators', () => {
    it('returns active moderators with both stats and activityStats objects', async () => {
      vi.spyOn(adminRepository, 'listModeratorsWithStats').mockResolvedValue([
        {
          id: 'mod-1',
          name: 'Faculty Mod',
          email: 'mod@nwu.edu.bd',
          avatarUrl: null,
          department: 'CSE',
          isActive: true,
          verified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: { id: 'role-mod', name: 'MODERATOR' },
          stats: {
            jobsReviewed30d: 4,
            storiesReviewed30d: 2,
            activeClaimedJobs: 1,
            activeClaimedStories: 0,
          },
          activityStats: {
            jobsReviewed30d: 4,
            storiesReviewed30d: 2,
            activeClaimedJobs: 1,
            activeClaimedStories: 0,
          },
        } as never,
      ]);
      vi.spyOn(adminRepository, 'listModeratorInvitations').mockResolvedValue([]);

      const result = await adminService.listModerators('uni-1');

      expect(result.moderators).toHaveLength(1);
      expect((result.moderators[0] as any).stats.activeClaimedJobs).toBe(1);
      expect((result.moderators[0] as any).activityStats.activeClaimedJobs).toBe(1);
    });
  });

  describe('removeModerator', () => {
    it('deactivates moderator, releases claimed UNDER_REVIEW jobs & stories, revokes sessions, and bumps caches', async () => {
      vi.spyOn(userRepository, 'findAuthenticatedById').mockResolvedValue({
        id: 'mod-1',
        universityId: 'uni-1',
        name: 'Faculty Moderator',
        email: 'mod@nwu.edu.bd',
        role: { id: 'role-mod', name: 'MODERATOR', permissions: [] },
      } as never);
      const txSpy = vi.spyOn(adminRepository, 'removeModeratorTransaction').mockResolvedValue({
        user: { id: 'mod-1', name: 'Faculty Moderator', email: 'mod@nwu.edu.bd', isActive: false },
        releasedJobsCount: 3,
        releasedStoriesCount: 2,
      });
      const revokeSpy = vi.spyOn(tokenRepository, 'revokeByUserId').mockResolvedValue({ count: 2 } as never);
      const bumpSpy = vi.spyOn(cacheService, 'bumpVersion').mockResolvedValue(6);
      const auditSpy = vi.spyOn(auditLogRepository, 'record').mockResolvedValue({ id: 'audit-mod' } as never);

      const res = await adminService.removeModerator({
        userId: 'mod-1',
        universityId: 'uni-1',
        actorId: 'admin-1',
        reason: 'Faculty member completed moderation term and departed committee.',
      });

      expect(txSpy).toHaveBeenCalledWith('mod-1', 'uni-1');
      expect(revokeSpy).toHaveBeenCalledWith('mod-1');
      expect(bumpSpy).toHaveBeenCalledWith('jobs');
      expect(bumpSpy).toHaveBeenCalledWith('stories');
      expect(bumpSpy).toHaveBeenCalledWith('dir');
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MODERATOR_REMOVED',
          metadata: expect.objectContaining({
            releasedJobsCount: 3,
            releasedStoriesCount: 2,
          }),
        }),
      );
      expect(res.releasedJobsCount).toBe(3);
      expect(res.releasedStoriesCount).toBe(2);
    });
  });
});
