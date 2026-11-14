import crypto from 'node:crypto';
import type { RoleName } from '../../generated/prisma/client.js';
import { prisma } from '../../config/database.js';
import { env } from '../../config/index.js';
import { ApiError } from '../../errors/api-error.js';
import { tokenRepository } from '../../repositories/token.repository.js';
import { universityRepository } from '../../repositories/university.repository.js';
import {
  userRepository,
  type AuthenticatedUserRecord,
} from '../../repositories/user.repository.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';

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

export async function issueSession(user: AuthenticatedUserRecord) {
  const subject = { userId: user.id, universityId: user.universityId, role: user.role.name };
  const refresh = tokenService.createRefreshToken(subject);
  const accessToken = tokenService.createAccessToken(subject);

  await tokenRepository.create({
    id: refresh.id,
    tokenHash: tokenService.hash(refresh.token),
    userId: user.id,
    universityId: user.universityId,
    expiresAt: refresh.expiresAt,
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
    let university = input.universitySlug
      ? await universityRepository.findBySlug(input.universitySlug)
      : null;

    if (!university) {
      university = await prisma.university.findFirst({ where: { isActive: true } });
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

    const passwordHash = await passwordService.hash(input.password);
    const user = await userRepository.create({
      ...input,
      universityId: university.id,
      passwordHash,
    });

    // Automatically generate and dispatch email verification token
    const { passwordResetService } = await import('./password-reset.service.js');
    const emailResult = await passwordResetService.requestEmailVerification(user.id);

    return {
      user: toSafeUser(user),
      deliveredViaSmtp: 'deliveredViaSmtp' in emailResult ? emailResult.deliveredViaSmtp : false,
      debugToken: (emailResult as any).debugToken,
    };
  },

  async login(email: string, password: string) {
    const user = await userRepository.findAuthenticatedByEmail(email);
    if (!user || !user.university.isActive) {
      throw ApiError.unauthorized('Email or password is incorrect.');
    }

    if (!user.isActive) {
      throw ApiError.unauthorized(
        'Your account has been suspended or deactivated. Please contact administration.',
      );
    }

    if (env.NODE_ENV === 'production' && user.isDemo) {
      throw ApiError.unauthorized('Demo accounts are deactivated in production.');
    }

    const passwordMatches = await passwordService.verify(user.passwordHash, password);
    if (!passwordMatches) throw ApiError.unauthorized('Email or password is incorrect.');

    // Enforce Alumni administrative rejection check first so rejected alumni receive their explicit rejection message and reason
    if (user.role?.name === 'ALUMNI' && user.verificationStatus === 'REJECTED') {
      throw ApiError.unauthorized(
        'Your alumni accreditation was rejected: ' +
          (user.rejectionReason || 'Please contact administration.'),
      );
    }

    // Enforce email verification check
    if (!user.verified) {
      throw ApiError.unauthorized(
        'Your email address has not been verified. Please check your inbox for the verification link.',
      );
    }

    // Enforce Alumni administrative verification check
    if (user.role?.name === 'ALUMNI' && user.verificationStatus === 'PENDING') {
      throw ApiError.unauthorized(
        'Your alumni registration is awaiting administrative verification. You will receive an email once approved.',
      );
    }

    return issueSession(user);
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

  async setupAccount(input: { token: string; name: string; password: string }) {
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

    return issueSession(user);
  },

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw ApiError.unauthorized('User account not found.');

    const matches = await passwordService.verify(user.passwordHash, currentPass);
    if (!matches) {
      throw ApiError.badRequest('Current password does not match records.');
    }

    const passwordHash = await passwordService.hash(newPass);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        needPasswordChange: false,
      },
    });

    // Revoke all existing sessions for safety except current
    await tokenRepository.revokeByUserId(userId);

    return { success: true, message: 'Password updated successfully. Please sign in with your new password.' };
  },

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw ApiError.unauthorized('A refresh token is required.');
    const payload = tokenService.verifyRefreshToken(refreshToken);
    const storedToken = await tokenRepository.findActiveById(payload.jti as string);

    if (!storedToken || storedToken.tokenHash !== tokenService.hash(refreshToken)) {
      throw ApiError.unauthorized('This session has expired or was revoked.');
    }

    const user = await userRepository.findAuthenticatedById(payload.sub);
    if (!user || !user.isActive || !user.university.isActive) {
      throw ApiError.unauthorized('This account is unavailable.');
    }

    await tokenRepository.revoke(storedToken.id);
    return issueSession(user);
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
};
