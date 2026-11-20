import crypto from 'node:crypto';
import type { Prisma, RoleName } from '../../generated/prisma/client.js';
import { PERMISSIONS, rolePermissionMap } from '../../constants/permissions.js';
import { ApiError } from '../../errors/api-error.js';
import { adminRepository } from '../../repositories/admin.repository.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { departmentRepository } from '../../repositories/department.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { universityRepository } from '../../repositories/university.repository.js';
import {
  userRepository,
  type VerificationFilters,
  type AdminUserFilters,
} from '../../repositories/user.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { emailService } from '../email/email.service.js';
import { notificationService } from '../notification/notification.service.js';
import { passwordResetService } from '../auth/password-reset.service.js';
import { toPageMeta } from '../../utils/pagination.js';

export interface UpdateAdminUserInput {
  name?: string;
  departmentId?: string | null;
  department?: string | null;
  batch?: string | null;
  graduationYear?: string | null;
  studentId?: string | null;
  academicId?: string | null;
  currentSemester?: string | null;
  expectedGraduationYear?: string | null;
  position?: string | null;
  currentPosition?: string | null;
  currentCompany?: string | null;
  company?: string | null;
  employmentStatus?: string | null;
}

const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  STUDENT: 'Current enrolled university students who can browse verified alumni, request mentorship, and apply to jobs.',
  ALUMNI: 'Accredited university graduates who can mentor students, publish jobs, and share success stories.',
  MODERATOR: 'Appointed faculty and campus staff who review job postings, success stories, and safety reports.',
  SUPER_ADMIN: 'Institutional administrators with full governance authority over identity verification, roles, and platform settings.',
};

const PERMISSION_LABELS: Record<string, { resource: string; action: string; description: string }> = {
  [PERMISSIONS.ALUMNI_READ]: {
    resource: 'Directory',
    action: 'Read Alumni & Members',
    description: 'Search and view privacy-filtered campus directory profiles.',
  },
  [PERMISSIONS.CONNECTION_CREATE]: {
    resource: 'Connections',
    action: 'Send Requests',
    description: 'Initiate symmetric connection requests with campus members.',
  },
  [PERMISSIONS.CONNECTION_RESPOND]: {
    resource: 'Connections',
    action: 'Accept / Decline',
    description: 'Respond to incoming connection requests and manage connections.',
  },
  [PERMISSIONS.JOB_READ]: {
    resource: 'Jobs',
    action: 'Browse Jobs',
    description: 'View published campus career and internship listings.',
  },
  [PERMISSIONS.JOB_CREATE]: {
    resource: 'Jobs',
    action: 'Post Jobs',
    description: 'Draft and submit job opportunities for editorial moderation.',
  },
  [PERMISSIONS.JOB_APPLY]: {
    resource: 'Jobs',
    action: 'Apply to Jobs',
    description: 'Submit job applications and attach resumes.',
  },
  [PERMISSIONS.JOB_REVIEW]: {
    resource: 'Moderation',
    action: 'Review Jobs',
    description: 'Claim, approve, reject, or request changes on submitted jobs.',
  },
  [PERMISSIONS.REPORT_REVIEW]: {
    resource: 'Moderation',
    action: 'Review Safety Reports',
    description: 'Inspect and resolve community safety and content reports.',
  },
  [PERMISSIONS.CONTENT_MANAGE]: {
    resource: 'Content',
    action: 'Manage Announcements & Stories',
    description: 'Publish institutional announcements and moderate editorial stories.',
  },
  [PERMISSIONS.EVENT_MANAGE]: {
    resource: 'Events',
    action: 'Manage Campus Events',
    description: 'Create, publish, cancel, and manage campus event RSVPs.',
  },
  [PERMISSIONS.USER_VERIFY]: {
    resource: 'User Governance',
    action: 'Verify & Govern Users',
    description: 'Approve/revoke alumni accreditation, suspend accounts, and change roles.',
  },
  [PERMISSIONS.ANALYTICS_READ]: {
    resource: 'Governance',
    action: 'View Analytics & Audit Logs',
    description: 'Inspect platform KPI metrics and immutable security audit logs.',
  },
  [PERMISSIONS.UNIVERSITY_MANAGE]: {
    resource: 'System',
    action: 'Staff Delegation & Config',
    description: 'Invite/remove moderators and configure institutional settings.',
  },
};

export const adminService = {
  async listUsers(universityId: string, filters: AdminUserFilters) {
    const [users, total] = await userRepository.listAdminUsers(universityId, filters);
    return {
      users,
      meta: toPageMeta(filters.page, filters.limit, total),
    };
  },

  async getUserDetail(userId: string, universityId: string) {
    const detail = await userRepository.findUserDetailForAdmin(userId, universityId);
    if (!detail) {
      throw ApiError.notFound('User');
    }
    return detail;
  },

  async updateUserByAdmin(input: {
    userId: string;
    universityId: string;
    actorId: string;
    data: UpdateAdminUserInput;
  }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    const updatePayload: Prisma.UserUpdateInput = {};

    if (input.data.name !== undefined) {
      updatePayload.name = input.data.name.trim();
    }

    if (input.data.departmentId !== undefined) {
      if (input.data.departmentId === null || input.data.departmentId === '') {
        updatePayload.departmentRef = { disconnect: true };
        if (input.data.department !== undefined) {
          updatePayload.department = input.data.department;
        } else {
          updatePayload.department = null;
        }
      } else {
        const dept = await departmentRepository.findById(
          input.data.departmentId,
          input.universityId,
        );
        if (!dept) {
          throw ApiError.badRequest('Selected department does not exist for this university.');
        }
        updatePayload.departmentRef = { connect: { id: dept.id } };
        updatePayload.department = dept.name;
      }
    } else if (input.data.department !== undefined) {
      updatePayload.department = input.data.department;
    }

    if (input.data.batch !== undefined) updatePayload.batch = input.data.batch;
    if (input.data.graduationYear !== undefined) {
      updatePayload.graduationYear = input.data.graduationYear;
    }
    if (input.data.studentId !== undefined) updatePayload.studentId = input.data.studentId;
    if (input.data.academicId !== undefined) updatePayload.academicId = input.data.academicId;
    if (input.data.currentSemester !== undefined) {
      updatePayload.currentSemester = input.data.currentSemester;
    }
    if (input.data.expectedGraduationYear !== undefined) {
      updatePayload.expectedGraduationYear = input.data.expectedGraduationYear;
    }
    if (input.data.employmentStatus !== undefined) {
      updatePayload.employmentStatus = input.data.employmentStatus;
    }

    const resolvedPosition =
      input.data.position !== undefined ? input.data.position : input.data.currentPosition;
    if (resolvedPosition !== undefined) {
      updatePayload.position = resolvedPosition;
    }

    const resolvedCompany =
      input.data.currentCompany !== undefined ? input.data.currentCompany : input.data.company;
    if (resolvedCompany !== undefined) {
      updatePayload.currentCompany = resolvedCompany;
    }

    const updated = await userRepository.updateUserByAdmin(
      input.userId,
      input.universityId,
      updatePayload,
    );

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'USER_UPDATED_BY_ADMIN',
      targetType: 'user',
      targetId: input.userId,
      metadata: {
        updatedFields: Object.keys(input.data).filter(
          (k) => input.data[k as keyof UpdateAdminUserInput] !== undefined,
        ),
      },
    });

    await cacheService.bumpVersion('dir');

    return updated;
  },

  async changeUserRole(input: {
    userId: string;
    universityId: string;
    actorId: string;
    role: 'STUDENT' | 'ALUMNI';
    graduationYear?: string | null;
    batch?: string | null;
    reason: string;
  }) {
    if (input.userId === input.actorId) {
      throw ApiError.forbidden('You cannot change your own Super Admin role.');
    }

    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    const currentRole = target.role.name;
    if (currentRole === 'MODERATOR' || currentRole === 'SUPER_ADMIN') {
      throw new ApiError(
        409,
        'Moderator and Super Admin roles cannot be transitioned into Student or Alumni accounts.',
        'INVALID_ROLE_TRANSITION',
      );
    }

    if (currentRole === input.role) {
      throw new ApiError(409, `User already holds the ${input.role} role.`, 'ROLE_UNCHANGED');
    }

    const targetRoleRecord = await adminRepository.findRoleByName(input.role);
    if (!targetRoleRecord) {
      throw ApiError.notFound('Target Role');
    }

    const updated = await userRepository.updateUserRoleTransaction(
      input.userId,
      input.universityId,
      {
        roleId: targetRoleRecord.id,
        targetRoleName: input.role,
        graduationYear: input.graduationYear,
        batch: input.batch,
      },
    );

    // Revoke active sessions so JWT role claims refresh immediately on next login
    await tokenRepository.revokeByUserId(input.userId);

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'ROLE_CHANGED',
      targetType: 'user',
      targetId: input.userId,
      metadata: {
        fromRole: currentRole,
        toRole: input.role,
        graduationYear: input.graduationYear ?? null,
        reason: input.reason,
      },
    });

    await Promise.all([
      cacheService.bumpVersion('dir'),
      cacheService.bumpVersion('jobs'),
    ]);

    await notificationService.notifyUser({
      userId: input.userId,
      type: 'SECURITY_ALERT',
      title: 'Account Role Updated',
      body: `An administrator updated your institutional role from ${currentRole} to ${input.role}. Please sign in again to refresh your workspace.`,
      link: '/login',
    });

    return updated;
  },

  async sendPasswordResetByAdmin(input: {
    userId: string;
    universityId: string;
    actorId: string;
  }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    const result = await passwordResetService.requestPasswordReset(target.email);

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'PASSWORD_RESET_LINK_SENT',
      targetType: 'user',
      targetId: input.userId,
      metadata: { email: target.email },
    });

    return {
      success: true,
      message: `Password reset instructions dispatched to ${target.email}.`,
      deliveredViaSmtp: 'deliveredViaSmtp' in result ? Boolean(result.deliveredViaSmtp) : false,
    };
  },

  async terminateUserSessions(input: { userId: string; universityId: string; actorId: string }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    await tokenRepository.revokeByUserId(input.userId);

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'USER_SESSIONS_TERMINATED',
      targetType: 'user',
      targetId: input.userId,
    });

    await notificationService.notifyUser({
      userId: input.userId,
      type: 'SECURITY_ALERT',
      title: 'Sessions Terminated',
      body: 'An administrator terminated all your active device logins.',
      link: '/login',
    });

    return {
      success: true,
      message: 'All active sessions for this user have been terminated.',
    };
  },

  async listVerifications(universityId: string, filters: VerificationFilters) {
    const [users, total] = await userRepository.listVerifications(universityId, filters);

    const studentIds = Array.from(
      new Set(users.map((u) => u.studentId).filter((v): v is string => Boolean(v))),
    );
    const academicIds = Array.from(
      new Set(users.map((u) => u.academicId).filter((v): v is string => Boolean(v))),
    );

    const { studentMap, academicMap } = await adminRepository.findDuplicateIdCounts(
      universityId,
      studentIds,
      academicIds,
    );

    const enrichedUsers = users.map((u) => {
      const emailDomain = u.email.split('@')[1]?.toLowerCase() ?? '';
      const uniDomain = u.university?.domain?.toLowerCase() ?? '';
      const emailDomainValid = Boolean(uniDomain && emailDomain.endsWith(uniDomain));

      const stuCount = u.studentId ? (studentMap.get(u.studentId) ?? 1) : 1;
      const acadCount = u.academicId ? (academicMap.get(u.academicId) ?? 1) : 1;
      const duplicateIdCount = Math.max(stuCount - 1, acadCount - 1, 0);

      return {
        ...u,
        signals: {
          emailDomainValid,
          duplicateIdCount,
        },
      };
    });

    return {
      users: enrichedUsers,
      meta: toPageMeta(filters.page, filters.limit, total),
    };
  },

  async reviewVerification(input: {
    userId: string;
    universityId: string;
    actorId: string;
    status: 'APPROVED' | 'REJECTED' | 'REVOKED';
    reason?: string;
  }) {
    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    // Unverified students or alumni cannot be accredited before email verification
    if (input.status === 'APPROVED' && !target.verified) {
      throw ApiError.badRequest(
        'User must verify their email address before administrative accreditation approval.',
      );
    }

    const reviewed = await userRepository.reviewVerification(
      input.userId,
      input.universityId,
      input.status,
      input.reason,
    );

    // If rejected or revoked, immediately invalidate active sessions for security
    if (input.status === 'REJECTED' || input.status === 'REVOKED') {
      await tokenRepository.revokeByUserId(input.userId);
    }

    // Send decision email
    if (input.status === 'APPROVED' || input.status === 'REJECTED') {
      await emailService.sendVerificationDecisionEmail(
        target.email,
        target.name,
        input.status,
        input.reason,
      );
    }

    const auditAction =
      input.status === 'APPROVED'
        ? 'USER_VERIFIED'
        : input.status === 'REVOKED'
          ? 'USER_VERIFICATION_REVOKED'
          : 'USER_VERIFICATION_REJECTED';

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: auditAction,
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    // Invalidate shared directory, job, and story caches immediately
    await Promise.all([
      cacheService.bumpVersion('dir'),
      cacheService.bumpVersion('jobs'),
      cacheService.bumpVersion('stories'),
    ]);

    const isStudent = target.role?.name === 'STUDENT';
    const dashboardLink = isStudent ? '/student/dashboard' : '/alumni/dashboard';
    const profileEditLink = isStudent ? '/student/profile/edit' : '/alumni/profile/edit';
    const roleLabel = isStudent ? 'student' : 'alumni';

    if (input.status === 'APPROVED') {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'ACCOUNT_VERIFICATION',
        title: 'Accreditation Approved',
        body: `Congratulations! Your ${roleLabel} accreditation has been officially approved.`,
        link: dashboardLink,
      });
    } else if (input.status === 'REJECTED') {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'MODERATION_RESULT',
        title: 'Accreditation Declined',
        body: `Your ${roleLabel} accreditation was rejected: ${input.reason || 'Credentials could not be verified'}. Please review your academic details.`,
        link: profileEditLink,
      });
    } else if (input.status === 'REVOKED') {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'MODERATION_RESULT',
        title: 'Accreditation Revoked',
        body: `Your ${roleLabel} accreditation was revoked by administration: ${input.reason || 'Administrative review required'}.`,
        link: '/login',
      });
    }

    return reviewed;
  },

  async verifyUser(input: { userId: string; universityId: string; actorId: string }) {
    return this.reviewVerification({
      ...input,
      status: 'APPROVED',
    });
  },

  async getStats(universityId?: string) {
    let resolvedUniversityId = universityId;
    if (!resolvedUniversityId) {
      const canonical = await universityRepository.findCanonical();
      resolvedUniversityId = canonical?.id || '';
    }
    return adminRepository.getDashboardStats(resolvedUniversityId);
  },

  async listAuditLogs(
    filters: {
      page?: number;
      limit?: number;
      search?: string;
      action?: string;
      actorId?: string;
      actorRole?: string;
      targetType?: string;
      result?: 'SUCCESS' | 'FAILURE';
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;

    const { logs, total } = await auditLogRepository.findPaginated(
      {
        search: filters.search,
        action: filters.action,
        actorId: filters.actorId,
        actorRole: filters.actorRole,
        targetType: filters.targetType,
        result: filters.result,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      { page, limit },
    );

    return {
      logs: logs.map((l) => ({
        id: l.id,
        action: l.action,
        actorId: l.actorId,
        actorName: l.actor?.name ?? 'System / Anonymous',
        actorEmail: l.actor?.email ?? null,
        actorRole: l.actorRole ?? l.actor?.role?.name ?? 'SYSTEM',
        target: l.targetType ? `${l.targetType}${l.targetId ? `:${l.targetId}` : ''}` : 'System',
        targetType: l.targetType,
        targetId: l.targetId,
        result: l.result,
        ip: l.ip,
        userAgent: l.userAgent,
        requestId: l.requestId,
        details: l.metadata
          ? typeof l.metadata === 'string'
            ? l.metadata
            : JSON.stringify(l.metadata)
          : l.action,
        metadata: l.metadata,
        timestamp: l.createdAt.toISOString(),
      })),
      meta: toPageMeta(page, limit, total),
    };
  },

  async listModerators(universityId: string) {
    const [moderators, invitations] = await Promise.all([
      adminRepository.listModeratorsWithStats(universityId),
      adminRepository.listModeratorInvitations(),
    ]);

    return {
      moderators,
      invitations,
    };
  },

  async removeModerator(input: {
    userId: string;
    universityId: string;
    actorId: string;
    reason: string;
  }) {
    if (input.userId === input.actorId) {
      throw ApiError.badRequest('You cannot remove your own account.');
    }

    const target = await userRepository.findAuthenticatedById(input.userId);
    if (!target || target.universityId !== input.universityId) {
      throw ApiError.notFound('Moderator');
    }

    if (target.role.name !== 'MODERATOR') {
      throw new ApiError(
        400,
        'Only accounts with the MODERATOR role can be removed via this endpoint.',
        'INVALID_ROLE',
      );
    }

    const result = await adminRepository.removeModeratorTransaction(
      input.userId,
      input.universityId,
    );

    await tokenRepository.revokeByUserId(input.userId);

    await Promise.all([
      cacheService.bumpVersion('jobs'),
      cacheService.bumpVersion('stories'),
      cacheService.bumpVersion('dir'),
    ]);

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.actorId,
      action: 'MODERATOR_REMOVED',
      targetType: 'user',
      targetId: input.userId,
      metadata: {
        reason: input.reason,
        releasedJobsCount: result.releasedJobsCount,
        releasedStoriesCount: result.releasedStoriesCount,
      },
    });

    await notificationService.notifyUser({
      userId: input.userId,
      type: 'RESTRICTION_APPLIED',
      title: 'Moderator Privileges Removed',
      body: `Your platform moderator privileges have been deactivated by administration. Reason: ${input.reason}`,
      link: '/login',
    });

    return result;
  },

  async inviteModerator(input: { email: string; actorId: string; universityId?: string }) {
    const normalizedEmail = input.email.trim().toLowerCase();

    const existingUser = await userRepository.findAuthenticatedByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('A user with this email address already exists.');
    }

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000); // 72 hours

    const invitation = await adminRepository.upsertModeratorInvitation({
      email: normalizedEmail,
      tokenHash,
      expiresAt,
      actorId: input.actorId,
    });

    const emailResult = await emailService.sendModeratorInvitationEmail(normalizedEmail, plainToken);

    const universityId = input.universityId || (await universityRepository.findCanonical())?.id;
    if (universityId) {
      await auditLogRepository.record({
        universityId,
        actorId: input.actorId,
        action: 'MODERATOR_INVITED',
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: { email: normalizedEmail },
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      setupUrl: emailResult.setupUrl,
      invitationUrl: emailResult.setupUrl,
    };
  },

  async listModeratorInvitations() {
    return adminRepository.listModeratorInvitations();
  },

  async resendModeratorInvitation(id: string, actorId: string, universityId?: string) {
    const invitation = await adminRepository.findModeratorInvitationById(id);
    if (!invitation) throw ApiError.notFound('Invitation');
    if (invitation.acceptedAt) throw ApiError.badRequest('This invitation has already been accepted.');

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1_000);

    await adminRepository.updateModeratorInvitation(id, {
      tokenHash,
      expiresAt,
      revokedAt: null,
    });

    const emailResult = await emailService.sendModeratorInvitationEmail(invitation.email, plainToken);

    const resolvedUniId = universityId || (await universityRepository.findCanonical())?.id;
    if (resolvedUniId) {
      await auditLogRepository.record({
        universityId: resolvedUniId,
        actorId,
        action: 'MODERATOR_INVITATION_RESENT',
        targetType: 'invitation',
        targetId: invitation.id,
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt,
      success: true,
      deliveredViaSmtp: emailResult.deliveredViaSmtp,
      setupUrl: emailResult.setupUrl,
      invitationUrl: emailResult.setupUrl,
    };
  },

  async revokeModeratorInvitation(id: string, actorId: string, universityId?: string) {
    const invitation = await adminRepository.findModeratorInvitationById(id);
    if (!invitation) throw ApiError.notFound('Invitation');
    if (invitation.acceptedAt) {
      throw ApiError.badRequest('Cannot revoke an already accepted invitation.');
    }

    await adminRepository.updateModeratorInvitation(id, {
      revokedAt: new Date(),
    });

    const resolvedUniId = universityId || (await universityRepository.findCanonical())?.id;
    if (resolvedUniId) {
      await auditLogRepository.record({
        universityId: resolvedUniId,
        actorId,
        action: 'MODERATOR_INVITATION_REVOKED',
        targetType: 'invitation',
        targetId: invitation.id,
      });
    }

    return { success: true, message: 'Invitation revoked.' };
  },

  async toggleUserSuspension(input: {
    userId: string;
    universityId: string;
    isActive: boolean;
    reason?: string;
    actorId: string;
  }) {
    if (input.userId === input.actorId) {
      throw ApiError.badRequest('You cannot suspend or deactivate your own Super Admin account.');
    }

    const targetUser = await userRepository.findAuthenticatedById(input.userId);
    if (!targetUser || targetUser.universityId !== input.universityId) {
      throw ApiError.notFound('User');
    }

    // Protect last active Super Admin
    if (targetUser.role.name === 'SUPER_ADMIN' && !input.isActive) {
      const activeSuperAdmins = await adminRepository.countActiveSuperAdmins(input.universityId);
      if (activeSuperAdmins <= 1) {
        throw new ApiError(
          409,
          'The last remaining active Super Admin cannot be suspended.',
          'LAST_SUPER_ADMIN',
        );
      }
    }

    const updated = await userRepository.updateUserActiveStatus(
      input.userId,
      input.universityId,
      input.isActive,
    );

    if (!input.isActive) {
      await tokenRepository.revokeByUserId(input.userId);
    }

    await auditLogRepository.record({
      universityId: targetUser.universityId,
      actorId: input.actorId,
      action: input.isActive ? 'USER_RESTORED' : 'USER_SUSPENDED',
      targetType: 'user',
      targetId: input.userId,
      metadata: input.reason ? { reason: input.reason } : undefined,
    });

    await Promise.all([
      cacheService.bumpVersion('dir'),
      cacheService.bumpVersion('jobs'),
      cacheService.bumpVersion('stories'),
    ]);

    const roleName = targetUser.role?.name;
    const rolePrefix =
      roleName === 'SUPER_ADMIN'
        ? '/admin'
        : roleName === 'MODERATOR'
          ? '/moderator'
          : roleName === 'ALUMNI'
            ? '/alumni'
            : '/student';

    if (!input.isActive) {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'RESTRICTION_APPLIED',
        title: 'Account Suspended',
        body: `Your account access has been suspended by administration.${input.reason ? ` Reason: ${input.reason}` : ''}`,
        link: '/login',
      });
    } else {
      await notificationService.notifyUser({
        userId: input.userId,
        type: 'RESTRICTION_ENDED',
        title: 'Account Restored',
        body: 'Your account access has been fully restored. Welcome back.',
        link: `${rolePrefix}/dashboard`,
      });
    }

    return updated;
  },

  async getRolesOverview(universityId: string) {
    const { roles, countMap, superAdmins, recentRoleAuditLogs } =
      await adminRepository.getRolesAndAdminsOverview(universityId);

    const orderedRoleNames: RoleName[] = ['STUDENT', 'ALUMNI', 'MODERATOR', 'SUPER_ADMIN'];
    const roleSummaries = orderedRoleNames.map((roleName) => {
      const dbRole = roles.find((r) => r.name === roleName);
      return {
        name: roleName,
        description: dbRole?.description || ROLE_DESCRIPTIONS[roleName],
        userCount: countMap[roleName] ?? 0,
        permissionCount: rolePermissionMap[roleName].length,
      };
    });

    const allPermissionKeys = Object.values(PERMISSIONS);
    const permissionMatrix = allPermissionKeys.map((key) => {
      const meta = PERMISSION_LABELS[key] || {
        resource: 'Platform',
        action: key,
        description: key,
      };
      return {
        key,
        resource: meta.resource,
        action: meta.action,
        description: meta.description,
        roles: {
          STUDENT: rolePermissionMap.STUDENT.includes(key),
          ALUMNI: rolePermissionMap.ALUMNI.includes(key),
          MODERATOR: rolePermissionMap.MODERATOR.includes(key),
          SUPER_ADMIN: rolePermissionMap.SUPER_ADMIN.includes(key),
        },
      };
    });

    return {
      roles: roleSummaries,
      permissionMatrix,
      superAdmins,
      recentRoleAuditLogs: recentRoleAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        actor: log.actor,
      })),
    };
  },

  async listAdmins(universityId: string) {
    const { superAdmins } = await adminRepository.getRolesAndAdminsOverview(universityId);
    return superAdmins;
  },

  async listUniversities() {
    return adminRepository.listUniversities();
  },

  async createUniversity(input: { name: string; slug: string; domain: string; actorId: string }) {
    const slug = input.slug.trim().toLowerCase();
    const domain = input.domain.trim().toLowerCase();

    const existing = await adminRepository.findUniversityBySlugOrDomain(slug, domain);
    if (existing) {
      throw ApiError.conflict('A university with this slug or domain already exists.');
    }

    const created = await adminRepository.createUniversity({
      name: input.name.trim(),
      slug,
      domain,
    });

    await auditLogRepository.record({
      universityId: created.id,
      actorId: input.actorId,
      action: 'UNIVERSITY_CREATED',
      targetType: 'university',
      targetId: created.id,
    });

    return created;
  },

  async toggleUniversityStatus(universityId: string, isActive: boolean, actorId: string) {
    const updated = await adminRepository.updateUniversityStatus(universityId, isActive);

    await auditLogRepository.record({
      universityId,
      actorId,
      action: isActive ? 'UNIVERSITY_ACTIVATED' : 'UNIVERSITY_DEACTIVATED',
      targetType: 'university',
      targetId: universityId,
    });

    return updated;
  },
};
