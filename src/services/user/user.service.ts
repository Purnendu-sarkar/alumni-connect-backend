import { Role, UserStatus, VerificationStatus } from '@prisma/client';

import { prisma } from '../../config/database.js';
import { cacheGet, cacheSet, getVersion } from '../../config/redis.js';
import { ApiError } from '../../errors/api-error.js';
import { userModel } from '../../models/user.model.js';

export const userService = {
  async getProfile(userId: string) {
    const user = await userModel.findById(userId);
    if (!user) throw ApiError.notFound('User profile');
    return user;
  },

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      fullName?: string;
      currentJob?: string;
      company?: string;
      bio?: string;
      skills?: string[];
      phone?: string;
      location?: string;
      linkedinUrl?: string;
      githubUrl?: string;
      websiteUrl?: string;
    },
  ) {
    const user = await userModel.findById(userId);
    if (!user) throw ApiError.notFound('User profile');

    const fullName = data.fullName ?? data.name;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.profile.upsert({
        where: { userId },
        update: {
          fullName: fullName ?? undefined,
          currentJob: data.currentJob,
          company: data.company,
          bio: data.bio,
          skills: data.skills,
          phone: data.phone,
          location: data.location,
          links: {
            linkedin: data.linkedinUrl,
            github: data.githubUrl,
            website: data.websiteUrl,
          },
        },
        create: {
          userId,
          fullName: fullName ?? 'Anonymous Member',
          currentJob: data.currentJob,
          company: data.company,
          bio: data.bio,
          skills: data.skills ?? [],
          phone: data.phone,
          location: data.location,
          links: {
            linkedin: data.linkedinUrl,
            github: data.githubUrl,
            website: data.websiteUrl,
          },
        },
      });

      return tx.user.findUnique({
        where: { id: userId },
        include: { profile: true, privacy: true },
      });
    });

    return updated;
  },

  async listDirectory(options: {
    department?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(50, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;

    const cacheVer = await getVersion('dir');
    const cacheKey = `dir:${cacheVer}:${options.department ?? 'all'}:${options.search ?? ''}:${page}:${limit}`;

    const cached = await cacheGet<{ users: unknown[]; total: number; totalPages: number; page: number; limit: number }>(cacheKey);
    if (cached) return cached;

    const [users, total] = await userModel.listUsers({
      role: Role.ALUMNI,
      status: UserStatus.ACTIVE,
      verificationStatus: VerificationStatus.APPROVED,
      department: options.department,
      search: options.search,
      skip,
      take: limit,
    });

    const result = {
      users,
      total,
      totalPages: Math.ceil(total / limit),
      page,
      limit,
    };

    // Cache directory list without PII (profiles only contain public fields)
    await cacheSet(cacheKey, result, 120);

    return result;
  },
};
