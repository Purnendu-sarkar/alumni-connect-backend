import { prisma } from '../config/database.js';
import type { Prisma, Role, UserStatus, VerificationStatus } from '@prisma/client';

export const userModel = {
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        privacy: true,
      },
    });
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        profile: true,
        privacy: true,
      },
    });
  },

  findByUniversityId(universityId: string) {
    return prisma.user.findUnique({
      where: { universityId: universityId.trim() },
      include: {
        profile: true,
      },
    });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
      include: {
        profile: true,
        privacy: true,
      },
    });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
      include: {
        profile: true,
        privacy: true,
      },
    });
  },

  listUsers(options: {
    role?: Role;
    status?: UserStatus;
    verificationStatus?: VerificationStatus;
    department?: string;
    search?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.UserWhereInput = {};

    if (options.role) where.role = options.role;
    if (options.status) where.status = options.status;
    if (options.verificationStatus) where.verificationStatus = options.verificationStatus;

    if (options.department) {
      where.profile = { department: options.department };
    }

    if (options.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { universityId: { contains: options.search, mode: 'insensitive' } },
        { profile: { fullName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    return Promise.all([
      prisma.user.findMany({
        where,
        skip: options.skip ?? 0,
        take: options.take ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          privacy: true,
        },
      }),
      prisma.user.count({ where }),
    ]);
  },
};
