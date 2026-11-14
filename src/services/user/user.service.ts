import fs from 'node:fs/promises';
import path from 'node:path';

import { ApiError } from '../../errors/api-error.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import type { UpdateProfileInput } from '../../validators/user.schema.js';

interface ProfileMetrics {
  completionPercentage: number;
  onboardingCompleted: boolean;
  missingRequiredFields: string[];
}

function calculateProfileMetrics(profile: NonNullable<Awaited<ReturnType<typeof userRepository.findFullProfileById>>>): ProfileMetrics {
  const role = profile.role.name;
  const missingRequiredFields: string[] = [];

  const check = (fieldName: string, value: unknown) => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      missingRequiredFields.push(fieldName);
      return false;
    }
    return true;
  };

  let requiredChecks: boolean[] = [];

  if (role === 'STUDENT') {
    requiredChecks = [
      check('Full Name', profile.name),
      check('Email Address', profile.email),
      check('Student ID', profile.studentId),
      check('Department', profile.department),
      check('Batch', profile.batch),
    ];
  } else if (role === 'ALUMNI') {
    requiredChecks = [
      check('Full Name', profile.name),
      check('Email Address', profile.email),
      check('Department', profile.department),
      check('Graduation Year', profile.graduationYear || profile.batch),
      check('Academic ID', profile.academicId),
    ];
  } else {
    requiredChecks = [
      check('Full Name', profile.name),
      check('Email Address', profile.email),
    ];
  }

  // Optional/rich fields for completion bonus (up to 100%)
  const optionalChecks = [
    Boolean(profile.bio?.trim()),
    Boolean(profile.skills?.length),
    Boolean(profile.avatarUrl?.trim()),
    Boolean(profile.linkedinUrl?.trim()),
    ...(role === 'ALUMNI' ? [Boolean(profile.currentCompany?.trim() || profile.position?.trim())] : []),
  ];

  const requiredFilled = requiredChecks.filter(Boolean).length;
  const optionalFilled = optionalChecks.filter(Boolean).length;

  const requiredScore = Math.round((requiredFilled / requiredChecks.length) * 70);
  const optionalScore = Math.round((optionalFilled / optionalChecks.length) * 30);
  const completionPercentage = Math.min(100, requiredScore + optionalScore);
  const onboardingCompleted = requiredChecks.every(Boolean);

  return {
    completionPercentage,
    onboardingCompleted,
    missingRequiredFields,
  };
}

export const userService = {
  async getMe(userId: string) {
    const profile = await userRepository.findFullProfileById(userId);
    if (!profile) throw ApiError.unauthorized('Profile not found.');

    const metrics = calculateProfileMetrics(profile);
    return { ...profile, ...metrics };
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
      if (input.isMentorshipAvailable !== undefined) data.isMentorshipAvailable = input.isMentorshipAvailable;
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

    // Auto-update onboardingCompleted if all mandatory fields are satisfied
    const simulatedProfile = { ...current, ...data };
    const simulatedMetrics = calculateProfileMetrics(simulatedProfile as any);
    if (data.onboardingCompleted === undefined && simulatedMetrics.onboardingCompleted && !current.onboardingCompleted) {
      data.onboardingCompleted = true;
    }

    const updated = await userRepository.updateProfile(userId, universityId, data);
    const metrics = calculateProfileMetrics(updated);

    return { ...updated, ...metrics };
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
    const isStaff = requester.role === 'SUPER_ADMIN' || requester.role === 'MODERATOR';

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
