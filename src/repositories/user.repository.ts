import type { Prisma, RoleName } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

const authenticatedUserInclude = {
  role: { include: { permissions: true } },
  university: { select: { id: true, slug: true, domain: true, isActive: true } },
} as const satisfies Prisma.UserInclude;

export type AuthenticatedUserRecord = Prisma.UserGetPayload<{
  include: typeof authenticatedUserInclude;
}>;

export interface AlumniFilters extends PaginationInput {
  batch?: string;
  department?: string;
  company?: string;
}

export const userRepository = {
  findAuthenticatedById(id: string): Promise<AuthenticatedUserRecord | null> {
    return prisma.user.findUnique({ where: { id }, include: authenticatedUserInclude });
  },

  findAuthenticatedByEmail(email: string): Promise<AuthenticatedUserRecord | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: authenticatedUserInclude,
    });
  },

  async create(input: {
    universityId: string;
    role: RoleName;
    name: string;
    email: string;
    passwordHash: string;
    batch?: string;
    department?: string;
    currentCompany?: string;
    position?: string;
    skills?: string[];
  }): Promise<AuthenticatedUserRecord> {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: input.role } });

    return prisma.user.create({
      data: {
        universityId: input.universityId,
        roleId: role.id,
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        batch: input.batch,
        department: input.department,
        currentCompany: input.currentCompany,
        position: input.position,
        skills: input.skills ?? [],
      },
      include: authenticatedUserInclude,
    });
  },

  findAlumni(universityId: string, filters: AlumniFilters) {
    const where: Prisma.UserWhereInput = {
      universityId,
      verified: true,
      role: { name: 'ALUMNI' },
      ...(filters.batch ? { batch: { equals: filters.batch, mode: 'insensitive' } } : {}),
      ...(filters.department
        ? { department: { equals: filters.department, mode: 'insensitive' } }
        : {}),
      ...(filters.company
        ? { currentCompany: { contains: filters.company, mode: 'insensitive' } }
        : {}),
    };

    return prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          batch: true,
          department: true,
          currentCompany: true,
          position: true,
          bio: true,
          skills: true,
          avatarUrl: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.user.count({ where }),
    ]);
  },

  verifyForUniversity(userId: string, universityId: string) {
    return prisma.user.update({
      where: { id: userId, universityId },
      data: { verified: true },
      select: { id: true, name: true, email: true, verified: true },
    });
  },
};
