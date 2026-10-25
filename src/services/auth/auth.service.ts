import type { RoleName } from '../../generated/prisma/client.js';
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
  universitySlug: string;
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

async function issueSession(user: AuthenticatedUserRecord) {
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
    const [university, existingUser] = await Promise.all([
      universityRepository.findBySlug(input.universitySlug),
      userRepository.findAuthenticatedByEmail(input.email),
    ]);

    if (!university || !university.isActive) throw ApiError.notFound('Active university');
    if (existingUser) throw ApiError.conflict('An account with this email already exists.');

    const passwordHash = await passwordService.hash(input.password);
    const user = await userRepository.create({
      ...input,
      universityId: university.id,
      passwordHash,
    });

    return issueSession(user);
  },

  async login(email: string, password: string) {
    const user = await userRepository.findAuthenticatedByEmail(email);
    if (!user || !user.isActive || !user.university.isActive) {
      throw ApiError.unauthorized('Email or password is incorrect.');
    }

    const passwordMatches = await passwordService.verify(user.passwordHash, password);
    if (!passwordMatches) throw ApiError.unauthorized('Email or password is incorrect.');

    return issueSession(user);
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
