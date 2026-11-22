import crypto from 'node:crypto';
import type { RoleName } from '../../generated/prisma/client.js';
import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { departmentRepository } from '../../repositories/department.repository.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { universityRepository } from '../../repositories/university.repository.js';
import {
  userRepository,
  type AuthenticatedUserRecord,
} from '../../repositories/user.repository.js';
import { notificationService } from '../notification/notification.service.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';
import { maskIp, parseDeviceName } from '../../utils/device-parser.js';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
  universitySlug?: string;
  role: Extract<RoleName, 'STUDENT' | 'ALUMNI'>;
  batch?: string;
  department?: string;
  studentId?: string;
  currentSemester?: string;
  admissionYear?: string;
  expectedGraduationYear?: string;
  graduationYear?: string;
  academicId?: string;
  employmentStatus?: string;
  currentCompany?: string;
  position?: string;
  skills?: string[];
  interests?: string[];
}

function toSafeUser(user: AuthenticatedUserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    verified: user.verified,
    verificationStatus: user.verificationStatus,
    rejectionReason: user.rejectionReason,
    needPasswordChange: user.needPasswordChange ?? false,
    onboardingCompleted: user.onboardingCompleted ?? false,
    isMentorshipAvailable: user.isMentorshipAvailable ?? false,
    avatarUrl: user.avatarUrl,
    department: user.department,
    batch: user.batch,
    university: {
      id: user.university.id,
      name: user.university.name,
      slug: user.university.slug,
      domain: user.university.domain,
    },
  };
}

export async function issueSession(
  user: AuthenticatedUserRecord,
  existingFamilyId?: string | null,
  context?: { ip?: string; userAgent?: string; deviceName?: string },
) {
  const subject = { userId: user.id, universityId: user.universityId, role: user.role.name };
  const refresh = tokenService.createRefreshToken(subject);
  const accessToken = tokenService.createAccessToken(subject);
  const familyId = existingFamilyId || crypto.randomUUID();

  const deviceName =
    context?.deviceName ||
    parseDeviceName(context?.userAgent);

  await tokenRepository.create({
    id: refresh.id,
    tokenHash: tokenService.hash(refresh.token),
    familyId,
    userId: user.id,
    universityId: user.universityId,
    expiresAt: refresh.expiresAt,
    userAgent: context?.userAgent,
    ipAddress: context?.ip,
    deviceName,
    lastActiveAt: new Date(),
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    user: toSafeUser(user),
  };
}

export const authService = {
  async register(input: RegisterInput) {
    const targetSlug =
      input.universitySlug ||
      env.BOOTSTRAP_UNIVERSITY_SLUG ||
      'north-western-university';

    let university = await universityRepository.findBySlug(targetSlug);

    if (!university) {
      university = await prisma.university.findFirst({
        where: { isActive: true, isDemo: false },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!university || !university.isActive) {
      throw ApiError.notFound('Active university institution');
    }

    const existingUser = await userRepository.findAuthenticatedByEmail(input.email);
    if (existingUser) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    if (input.role === 'STUDENT' && input.studentId) {
      const existingStudent = await prisma.user.findFirst({
        where: { universityId: university.id, studentId: input.studentId },
      });
      if (existingStudent) {
        throw ApiError.conflict('An account with this Student ID already exists.');
      }
    }

    if (input.role === 'ALUMNI' && input.academicId) {
      const existingAlumni = await prisma.user.findFirst({
        where: { universityId: university.id, academicId: input.academicId },
      });
      if (existingAlumni) {
        throw ApiError.conflict('An account with this Academic / Student ID already exists.');
      }
    }

    let resolvedDepartmentId: string | undefined = undefined;
    let resolvedDepartmentName: string | undefined = input.department?.trim();

    if (input.department) {
      const matchedDept = await departmentRepository.findActiveByIdOrNameOrCode(
        university.id,
        input.department,
      );
      if (matchedDept) {
        resolvedDepartmentId = matchedDept.id;
        resolvedDepartmentName = matchedDept.name;
      }
    }

    const passwordHash = await passwordService.hash(input.password);
    const user = await userRepository.create({
      ...input,
      department: resolvedDepartmentName,
      departmentId: resolvedDepartmentId,
      universityId: university.id,
      passwordHash,
    });

    await auditLogRepository.record({
      universityId: university.id,
      actorId: user.id,
      actorRole: input.role,
      action: 'USER_REGISTERED',
      result: 'SUCCESS',
      targetType: 'user',
      targetId: user.id,
      metadata: {
        role: input.role,
        department: input.department,
        batch: input.batch,
      },
    });

    if (input.role === 'STUDENT') {
      await notificationService.notifyUser({
        userId: user.id,
        type: 'ACCOUNT_VERIFICATION',
        title: 'Welcome to Alumni Connect',
        body: 'Please verify your university email address to activate all network features.',
        link: '/student/profile',
      });
    } else if (input.role === 'ALUMNI') {
      await notificationService.notifyUser({
        userId: user.id,
        type: 'VERIFICATION_PENDING',
        title: 'Registration Submitted',
        body: 'Your graduation credentials have been submitted for administrative verification.',
        link: '/alumni/profile',
      });

      await notificationService.notifyRoles({
        universityId: university.id,
        roles: ['SUPER_ADMIN'],
        type: 'MODERATION_RESULT',
        title: 'New Alumni Verification Pending',
        body: `${user.name} registered as an alumnus and requires credential verification.`,
        link: '/admin/verification/pending',
      });
    }

    // Automatically generate and dispatch email verification token
    const { passwordResetService } = await import('./password-reset.service.js');
    const emailResult = await passwordResetService.requestEmailVerification(user.id);

    return {
      user: toSafeUser(user),
      deliveredViaSmtp: 'deliveredViaSmtp' in emailResult ? emailResult.deliveredViaSmtp : false,
      debugToken: 'debugToken' in emailResult ? (emailResult.debugToken as string | undefined) : undefined,
    };
  },

  async login(
    email: string,
    password: string,
    context?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const user = await userRepository.findAuthenticatedByEmail(email);
    if (!user || !user.university.isActive) {
      const firstUniversity = await prisma.university.findFirst();
      if (firstUniversity) {
        await auditLogRepository.record({
          universityId: firstUniversity.id,
          action: 'LOGIN_FAILED',
          result: 'FAILURE',
          ip: context?.ip,
          userAgent: context?.userAgent,
          requestId: context?.requestId,
          metadata: {
            reason: 'ACCOUNT_NOT_FOUND',
            emailDomain: email.split('@')[1] ?? 'unknown',
          },
        });
      }
      throw ApiError.unauthorized('Email or password is incorrect.');
    }

    if (!user.isActive) {
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: user.id,
        actorRole: user.role?.name,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
        targetType: 'user',
        targetId: user.id,
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
        metadata: { reason: 'ACCOUNT_SUSPENDED' },
      });
      throw ApiError.unauthorized(
        'Your account has been suspended or deactivated. Please contact administration.',
      );
    }

    if (env.NODE_ENV === 'production' && user.isDemo) {
      throw ApiError.unauthorized('Demo accounts are deactivated in production.');
    }

    const passwordMatches = await passwordService.verify(user.passwordHash, password);
    if (!passwordMatches) {
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: user.id,
        actorRole: user.role?.name,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
        targetType: 'user',
        targetId: user.id,
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      });
      throw ApiError.unauthorized('Email or password is incorrect.');
    }

    // Enforce Alumni administrative rejection check first so rejected alumni receive their explicit rejection message and reason
    if (user.role?.name === 'ALUMNI' && user.verificationStatus === 'REJECTED') {
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: user.id,
        actorRole: user.role?.name,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
        targetType: 'user',
        targetId: user.id,
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
        metadata: { reason: 'ALUMNI_VERIFICATION_REJECTED' },
      });
      throw ApiError.unauthorized(
        'Your alumni accreditation was rejected: ' +
          (user.rejectionReason || 'Please contact administration.'),
      );
    }

    // Enforce email verification check
    if (!user.verified) {
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: user.id,
        actorRole: user.role?.name,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
        targetType: 'user',
        targetId: user.id,
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
        metadata: { reason: 'EMAIL_UNVERIFIED' },
      });
      throw ApiError.unauthorized(
        'Your email address has not been verified. Please check your inbox for the verification link.',
      );
    }

    // Enforce Alumni administrative verification check
    if (user.role?.name === 'ALUMNI' && user.verificationStatus === 'PENDING') {
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: user.id,
        actorRole: user.role?.name,
        action: 'LOGIN_FAILED',
        result: 'FAILURE',
        targetType: 'user',
        targetId: user.id,
        ip: context?.ip,
        userAgent: context?.userAgent,
        requestId: context?.requestId,
        metadata: { reason: 'ALUMNI_VERIFICATION_PENDING' },
      });
      throw ApiError.unauthorized(
        'Your alumni registration is awaiting administrative verification. You will receive an email once approved.',
      );
    }

    await auditLogRepository.record({
      universityId: user.universityId,
      actorId: user.id,
      actorRole: user.role?.name,
      action: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      targetType: 'user',
      targetId: user.id,
      ip: context?.ip,
      userAgent: context?.userAgent,
      requestId: context?.requestId,
    });

    return issueSession(user, null, context);
  },

  async validateSetupAccount(plainToken: string) {
    if (!plainToken || typeof plainToken !== 'string') {
      throw ApiError.badRequest('A valid setup token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(plainToken.trim()).digest('hex');
    const invitation = await prisma.moderatorInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation) {
      throw ApiError.badRequest('Invalid or unrecognized account setup invitation link.');
    }

    if (invitation.revokedAt) {
      throw ApiError.badRequest('This invitation has been revoked by the Super Administrator.');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('This invitation has already been accepted and activated.');
    }

    if (invitation.expiresAt < new Date()) {
      throw ApiError.badRequest('This invitation link has expired. Please request a new one.');
    }

    return {
      valid: true,
      email: invitation.email,
      role: 'MODERATOR' as const,
    };
  },

  async setupAccount(
    input: { token: string; name: string; password: string },
    context?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const { token, name, password } = input;
    if (!token || typeof token !== 'string') {
      throw ApiError.badRequest('A valid setup token is required.');
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const invitation = await prisma.moderatorInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation) {
      throw ApiError.badRequest('Invalid or unrecognized account setup link.');
    }

    if (invitation.revokedAt) {
      throw ApiError.badRequest('This invitation has been revoked.');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('This invitation has already been accepted.');
    }

    if (invitation.expiresAt < new Date()) {
      throw ApiError.badRequest('This invitation link has expired.');
    }

    const existingUser = await userRepository.findAuthenticatedByEmail(invitation.email);
    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists.');
    }

    const university = await prisma.university.findFirst({ where: { isActive: true } });
    if (!university) throw ApiError.notFound('Active university institution');

    const moderatorRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'MODERATOR' },
    });

    const passwordHash = await passwordService.hash(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash,
          universityId: university.id,
          roleId: moderatorRole.id,
          verified: true,
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
          onboardingCompleted: true,
          isActive: true,
          isDemo: false,
        },
        include: {
          role: { include: { permissions: true } },
          university: { select: { id: true, name: true, slug: true, domain: true, isActive: true } },
        },
      });

      await tx.moderatorInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    await auditLogRepository.record({
      universityId: university.id,
      actorId: user.id,
      actorRole: 'MODERATOR',
      action: 'MODERATOR_SETUP_COMPLETED',
      result: 'SUCCESS',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: invitation.email },
    });

    await notificationService.notifyRoles({
      universityId: university.id,
      roles: ['SUPER_ADMIN'],
      type: 'SECURITY_ALERT',
      title: 'Moderator Onboarded',
      body: `${user.name} (${user.email}) activated their moderator account.`,
      link: '/admin/users/moderators',
    });

    return issueSession(user, null, context);
  },

  async changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
    context?: { ip?: string; userAgent?: string },
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw ApiError.unauthorized('User account not found.');

    const matches = await passwordService.verify(user.passwordHash, currentPass);
    if (!matches) {
      if (user.universityId) {
        await auditLogRepository.record({
          universityId: user.universityId,
          actorId: userId,
          action: 'PASSWORD_CHANGE_FAILED',
          targetType: 'user',
          targetId: userId,
          metadata: {
            reason: 'CURRENT_PASSWORD_INVALID',
            ip: context?.ip,
            userAgent: context?.userAgent,
            role: user.role?.name,
          },
        });
      }
      throw new ApiError(400, 'Current password does not match records.', 'CURRENT_PASSWORD_INVALID');
    }

    const isSamePassword = await passwordService.verify(user.passwordHash, newPass);
    if (isSamePassword) {
      throw new ApiError(
        422,
        'New password cannot be the same as your current password.',
        'PASSWORD_REUSE_NOT_ALLOWED',
      );
    }

    const passwordHash = await passwordService.hash(newPass);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          needPasswordChange: false,
        },
      });

      // Revoke all existing sessions across devices for safety
      await tokenRepository.revokeByUserId(userId);

      // Record AuditLog
      await auditLogRepository.record({
        universityId: user.universityId,
        actorId: userId,
        action: 'PASSWORD_CHANGED',
        targetType: 'user',
        targetId: userId,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          role: user.role?.name,
        },
      });
    });

    // Send asynchronous security alert email
    const { emailService } = await import('../email/email.service.js');
    emailService.sendSecurityAlertEmail(user.email, user.name, 'PASSWORD_CHANGED').catch((err) => {
      logger.warn({ err }, 'Failed to dispatch security alert email after password change.');
    });

    const roleName = user.role?.name;
    const rolePrefix =
      roleName === 'SUPER_ADMIN'
        ? '/admin'
        : roleName === 'MODERATOR'
          ? '/moderator'
          : roleName === 'ALUMNI'
            ? '/alumni'
            : '/student';

    await notificationService.notifyUser({
      userId,
      type: 'SECURITY_ALERT',
      title: 'Password Updated',
      body: 'Your account password was updated successfully. If you did not perform this change, contact administration immediately.',
      link: `${rolePrefix}/settings/security`,
    });

    return { success: true, message: 'Password updated successfully. Please sign in with your new password.' };
  },

  async refresh(refreshToken: string | undefined, context?: { ip?: string; userAgent?: string }) {
    if (!refreshToken) throw ApiError.unauthorized('A refresh token is required.');
    const payload = tokenService.verifyRefreshToken(refreshToken);
    const tokenHash = tokenService.hash(refreshToken);

    const storedToken = await tokenRepository.findById(payload.jti as string);

    // Reuse Detection: If token exists but was already revoked, someone is reusing an old/rotated token!
    if (storedToken && storedToken.revokedAt !== null) {
      if (storedToken.familyId) {
        await tokenRepository.revokeFamily(storedToken.familyId);
      }
      await auditLogRepository.record({
        universityId: storedToken.universityId,
        actorId: storedToken.userId,
        action: 'SESSION_REUSE_DETECTED',
        result: 'FAILURE',
        targetType: 'session',
        targetId: storedToken.id,
        metadata: {
          ip: context?.ip,
          userAgent: context?.userAgent,
          compromisedFamilyId: storedToken.familyId,
        },
      });
      await notificationService.notifyUser({
        userId: storedToken.userId,
        type: 'SECURITY_ALERT',
        title: 'Suspicious Session Terminated',
        body: 'A compromised session was detected. All your active sessions were terminated for security.',
        link: '/login',
      });
      throw new ApiError(
        401,
        'Suspicious session reuse detected. All sessions in this chain have been terminated for security. Please sign in again.',
        'SESSION_REUSE_DETECTED',
      );
    }

    if (!storedToken || storedToken.tokenHash !== tokenHash || storedToken.expiresAt < new Date()) {
      throw ApiError.unauthorized('This session has expired or was revoked.');
    }

    const user = await userRepository.findAuthenticatedById(payload.sub);
    if (!user || !user.isActive || !user.university.isActive) {
      throw ApiError.unauthorized('This account is unavailable.');
    }

    const nextSession = await issueSession(user, storedToken.familyId, context);
    await tokenRepository.revoke(storedToken.id, tokenService.hash(nextSession.refreshToken));
    return nextSession;
  },

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;

    try {
      const payload = tokenService.verifyRefreshToken(refreshToken);
      await tokenRepository.revoke(payload.jti as string);
    } catch {
      // Logout remains idempotent; an expired cookie should still be cleared client-side.
    }
  },

  async me(userId: string) {
    const user = await userRepository.findFullProfileById(userId);
    if (!user) throw ApiError.unauthorized('This account is unavailable.');
    return user;
  },

  async getQuickAccessProfiles() {
    const roleKeys: Array<keyof typeof SHOWCASE_ACCOUNTS> = [
      'SUPER_ADMIN',
      'MODERATOR',
      'ALUMNI',
      'STUDENT',
    ];
    const emails = roleKeys.map((r) => SHOWCASE_ACCOUNTS[r].email.toLowerCase());

    const users = await prisma.user.findMany({
      where: {
        email: { in: emails },
        isActive: true,
      },
      include: {
        role: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u]));

    return roleKeys.map((roleKey) => {
      const config = SHOWCASE_ACCOUNTS[roleKey];
      const user = userMap.get(config.email.toLowerCase());

      if (user) {
        let designation = user.headline;
        if (!designation) {
          if (roleKey === 'STUDENT') {
            designation = `${user.department || 'CSE'} ${
              user.currentSemester ? `(${user.currentSemester})` : `Batch ${user.batch || '2022'}`
            }`;
          } else if (roleKey === 'ALUMNI') {
            designation =
              user.position && user.currentCompany
                ? `${user.position} at ${user.currentCompany}`
                : config.defaultTitle;
          } else if (roleKey === 'MODERATOR') {
            designation = user.department
              ? `Faculty Moderator (${user.department})`
              : config.defaultTitle;
          } else {
            designation = config.defaultTitle;
          }
        }

        return {
          role: roleKey,
          label: config.label,
          name: user.name,
          email: user.email,
          department: user.department,
          designation,
          avatarUrl: user.avatarUrl,
        };
      }

      return {
        role: roleKey,
        label: config.label,
        name: config.label,
        email: config.email,
        department: null,
        designation: config.defaultTitle,
        avatarUrl: null,
      };
    });
  },

  async quickAccessLogin(
    role: 'SUPER_ADMIN' | 'MODERATOR' | 'ALUMNI' | 'STUDENT',
    context?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const config = SHOWCASE_ACCOUNTS[role];
    if (!config) {
      throw ApiError.badRequest(`Unrecognized showcase role '${role}'.`);
    }

    let user = await userRepository.findAuthenticatedByEmail(config.email);

    // Fallback if specific canonical email changed: find first active approved user of that role in canonical university
    if (!user) {
      const fallbackUser = await prisma.user.findFirst({
        where: {
          role: { name: role },
          university: { slug: 'north-western-university' },
          isActive: true,
          verificationStatus: 'APPROVED',
        },
        select: { email: true },
      });
      if (fallbackUser) {
        user = await userRepository.findAuthenticatedByEmail(fallbackUser.email);
      }
    }

    if (!user || !user.isActive) {
      throw ApiError.notFound(`Quick access user record for role '${role}' is not available.`);
    }

    await auditLogRepository.record({
      universityId: user.universityId,
      actorId: user.id,
      actorRole: user.role?.name,
      action: 'USER_LOGIN',
      result: 'SUCCESS',
      targetType: 'user',
      targetId: user.id,
      ip: context?.ip,
      userAgent: context?.userAgent,
      requestId: context?.requestId,
      metadata: { method: 'QUICK_ACCESS_SHOWCASE', role },
    });

    return issueSession(user, null, context);
  },

  async getLoginHistory(userId: string, limit = 15) {
    const logs = await auditLogRepository.findLoginHistoryForUser(userId, limit);
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      result: log.result,
      maskedIp: maskIp(log.ip),
      deviceName: parseDeviceName(log.userAgent),
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString(),
    }));
  },
};

export const SHOWCASE_ACCOUNTS = {
  SUPER_ADMIN: {
    email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL || 'dsr102.purnendu@gmail.com',
    label: 'Super Admin',
    defaultTitle: 'Platform Governance Lead',
  },
  MODERATOR: {
    email: 'mod.cse.islam@nwu.ac.bd',
    label: 'Moderator',
    defaultTitle: 'CSE Faculty & Moderator',
  },
  ALUMNI: {
    email: 'arif.gazi.2016.21@alumni.nwu.ac.bd',
    label: 'Alumni',
    defaultTitle: 'BBA Class of 2016 · HRBP',
  },
  STUDENT: {
    email: '2022101013@nwu.ac.bd',
    label: 'Student',
    defaultTitle: 'CSE Undergraduate · 8th Sem',
  },
} as const;
