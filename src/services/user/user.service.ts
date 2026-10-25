import fs from 'node:fs/promises';
import path from 'node:path';

import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import type { UpdateProfileInput } from '../../validators/user.schema.js';

function computeProfileCompletion(profile: NonNullable<Awaited<ReturnType<typeof userRepository.findFullProfileById>>>) {
  const role = profile.role.name;
  const commonFields = [
    Boolean(profile.name),
    Boolean(profile.department),
    Boolean(profile.batch),
    Boolean(profile.bio),
    Boolean(profile.avatarUrl),
    Boolean(profile.skills?.length),
  ];

  const roleFields =
    role === 'STUDENT'
      ? [Boolean(profile.studentId), Boolean(profile.currentSemester), Boolean(profile.interests?.length)]
      : [Boolean(profile.employmentStatus || profile.currentCompany), Boolean(profile.headline), Boolean(profile.linkedinUrl)];

  const totalFields = [...commonFields, ...roleFields];
  const filledCount = totalFields.filter(Boolean).length;
  return Math.round((filledCount / totalFields.length) * 100);
}

export const userService = {
  async getMe(userId: string) {
    const profile = await userRepository.findFullProfileById(userId);
    if (!profile) throw ApiError.unauthorized('Profile not found.');

    const completionPercentage = computeProfileCompletion(profile);
    return { ...profile, completionPercentage };
  },

  async updateMe(userId: string, universityId: string, input: UpdateProfileInput) {
    const current = await userRepository.findFullProfileById(userId);
    if (!current || current.universityId !== universityId) {
      throw ApiError.unauthorized('Account unavailable.');
    }

    const isAlumni = current.role.name === 'ALUMNI';
    const isStudent = current.role.name === 'STUDENT';

    // Build clean sanitized update payload
    const data: Record<string, unknown> = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.headline !== undefined) data.headline = input.headline;
    if (input.location !== undefined) data.location = input.location;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.phonePublic !== undefined) data.phonePublic = input.phonePublic;
    if (input.linkedinUrl !== undefined) data.linkedinUrl = input.linkedinUrl;
    if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl;
    if (input.githubUrl !== undefined) data.githubUrl = input.githubUrl;
    if (input.department !== undefined) data.department = input.department;
    if (input.batch !== undefined) data.batch = input.batch;
    if (input.skills !== undefined) data.skills = input.skills;
    if (input.interests !== undefined) data.interests = input.interests;
    if (input.onboardingCompleted !== undefined) data.onboardingCompleted = input.onboardingCompleted;

    // Role-specific field allowlist
    if (isStudent) {
      if (input.studentId !== undefined) data.studentId = input.studentId;
      if (input.currentSemester !== undefined) data.currentSemester = input.currentSemester;
      if (input.admissionYear !== undefined) data.admissionYear = input.admissionYear;
      if (input.expectedGraduationYear !== undefined)
        data.expectedGraduationYear = input.expectedGraduationYear;
    }

    if (isAlumni) {
      if (input.graduationYear !== undefined) data.graduationYear = input.graduationYear;
      if (input.academicId !== undefined) data.academicId = input.academicId;
      if (input.employmentStatus !== undefined) data.employmentStatus = input.employmentStatus;
      if (input.currentCompany !== undefined) data.currentCompany = input.currentCompany;
      if (input.position !== undefined) data.position = input.position;
    }

    // If previously rejected and user corrected academic info, reset verification to PENDING
    const academicModified =
      (input.studentId !== undefined && input.studentId !== current.studentId) ||
      (input.academicId !== undefined && input.academicId !== current.academicId) ||
      (input.department !== undefined && input.department !== current.department) ||
      (input.batch !== undefined && input.batch !== current.batch);

    if (current.verificationStatus === 'REJECTED' && academicModified) {
      data.verificationStatus = 'PENDING';
      data.rejectionReason = null;

      await auditLogRepository.record({
        universityId,
        actorId: userId,
        action: 'user.verification_resubmitted',
        targetType: 'user',
        targetId: userId,
      });
    }

    const updated = await userRepository.updateProfile(userId, universityId, data);
    const completionPercentage = computeProfileCompletion(updated);

    return { ...updated, completionPercentage };
  },

  async uploadAvatar(userId: string, universityId: string, filename: string) {
    const current = await userRepository.findFullProfileById(userId);
    if (!current || current.universityId !== universityId) {
      throw ApiError.unauthorized('Account unavailable.');
    }

    // Clean up old avatar if stored locally
    if (current.avatarUrl?.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(current.avatarUrl);
      const oldPath = path.resolve(process.cwd(), 'uploads', 'avatars', oldFilename);
      try {
        await fs.unlink(oldPath);
      } catch {
        // ignore missing file
      }
    }

    const avatarUrl = `/uploads/avatars/${filename}`;
    await userRepository.updateAvatar(userId, universityId, avatarUrl);

    return { avatarUrl };
  },

  async removeAvatar(userId: string, universityId: string) {
    const current = await userRepository.findFullProfileById(userId);
    if (!current || current.universityId !== universityId) {
      throw ApiError.unauthorized('Account unavailable.');
    }

    if (current.avatarUrl?.startsWith('/uploads/avatars/')) {
      const oldFilename = path.basename(current.avatarUrl);
      const oldPath = path.resolve(process.cwd(), 'uploads', 'avatars', oldFilename);
      try {
        await fs.unlink(oldPath);
      } catch {
        // ignore missing file
      }
    }

    await userRepository.updateAvatar(userId, universityId, null);
    return { avatarUrl: null };
  },

  async getAlumniById(
    alumniId: string,
    universityId: string,
    requester: { id: string; role: string },
  ) {
    const alumnus = await userRepository.findPublicAlumniById(alumniId, universityId);
    if (!alumnus) throw ApiError.notFound('Alumni profile');

    const isSelf = requester.id === alumniId;
    const isStaff = requester.role === 'ADMIN' || requester.role === 'SUPER_ADMIN' || requester.role === 'MODERATOR';

    // Unverified alumni profiles are hidden from other general users
    if (!alumnus.verified && !isSelf && !isStaff) {
      throw ApiError.notFound('Alumni profile');
    }

    // Enforce phone privacy
    if (!alumnus.phonePublic && !isSelf && !isStaff) {
      alumnus.phone = null;
    }

    return alumnus;
  },
};
