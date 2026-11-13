import type { Prisma, RoleName, VerificationStatus } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';
import type { PaginationInput } from '../utils/pagination.js';

const authenticatedUserInclude = {
  role: { include: { permissions: true } },
  university: { select: { id: true, name: true, slug: true, domain: true, isActive: true } },
} as const satisfies Prisma.UserInclude;

export type AuthenticatedUserRecord = Prisma.UserGetPayload<{
  include: typeof authenticatedUserInclude;
}>;

export interface AlumniFilters extends PaginationInput {
  batch?: string;
  department?: string;
  company?: string;
}

export interface VerificationFilters extends PaginationInput {
  role?: RoleName;
  status?: VerificationStatus;
  search?: string;
}

export interface AdminUserFilters extends PaginationInput {
  role?: RoleName;
  status?: 'ACTIVE' | 'SUSPENDED';
  verificationStatus?: VerificationStatus;
  search?: string;
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
        studentId: input.studentId,
        currentSemester: input.currentSemester,
        admissionYear: input.admissionYear,
        expectedGraduationYear: input.expectedGraduationYear,
        graduationYear: input.graduationYear ?? input.batch,
        academicId: input.academicId,
        employmentStatus: input.employmentStatus,
        currentCompany: input.currentCompany,
        position: input.position,
        skills: input.skills ?? [],
        interests: input.interests ?? [],
        verified: false,
        verificationStatus: 'PENDING',
        onboardingCompleted: true,
      },
      include: authenticatedUserInclude,
    });
  },

  findFullProfileById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        universityId: true,
        name: true,
        email: true,
        department: true,
        batch: true,
        studentId: true,
        currentSemester: true,
        admissionYear: true,
        expectedGraduationYear: true,
        graduationYear: true,
        academicId: true,
        employmentStatus: true,
        currentCompany: true,
        position: true,
        bio: true,
        headline: true,
        location: true,
        phone: true,
        phonePublic: true,
        linkedinUrl: true,
        websiteUrl: true,
        githubUrl: true,
        skills: true,
        interests: true,
        avatarUrl: true,
        verified: true,
        verificationStatus: true,
        rejectionReason: true,
        verifiedAt: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { id: true, name: true } },
        university: { select: { id: true, name: true, slug: true, domain: true } },
      },
    });
  },

  updateProfile(userId: string, universityId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id: userId, universityId },
      data,
      select: {
        id: true,
        universityId: true,
        name: true,
        email: true,
        department: true,
        batch: true,
        studentId: true,
        currentSemester: true,
        admissionYear: true,
        expectedGraduationYear: true,
        graduationYear: true,
        academicId: true,
        employmentStatus: true,
        currentCompany: true,
        position: true,
        bio: true,
        headline: true,
        location: true,
        phone: true,
        phonePublic: true,
        linkedinUrl: true,
        websiteUrl: true,
        githubUrl: true,
        skills: true,
        interests: true,
        avatarUrl: true,
        verified: true,
        verificationStatus: true,
        rejectionReason: true,
        verifiedAt: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { id: true, name: true } },
        university: { select: { id: true, name: true, slug: true, domain: true } },
      },
    });
  },

  findPublicAlumniById(id: string, universityId: string) {
    return prisma.user.findFirst({
      where: { id, universityId, role: { name: 'ALUMNI' } },
      select: {
        id: true,
        name: true,
        batch: true,
        department: true,
        currentCompany: true,
        position: true,
        bio: true,
        headline: true,
        location: true,
        linkedinUrl: true,
        websiteUrl: true,
        githubUrl: true,
        skills: true,
        interests: true,
        avatarUrl: true,
        verified: true,
        verificationStatus: true,
        graduationYear: true,
        employmentStatus: true,
        phone: true,
        phonePublic: true,
        createdAt: true,
        university: { select: { id: true, name: true, slug: true } },
      },
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
          headline: true,
          location: true,
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

  listVerifications(universityId: string, filters: VerificationFilters) {
    const where: Prisma.UserWhereInput = {
      universityId,
      // Only email-verified users can be processed for administrative accreditation
      verified: true,
      role: { name: filters.role ?? 'ALUMNI' },
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
              { department: { contains: filters.search, mode: 'insensitive' } },
              { batch: { contains: filters.search, mode: 'insensitive' } },
              { academicId: { contains: filters.search, mode: 'insensitive' } },
              { currentCompany: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          batch: true,
          department: true,
          studentId: true,
          academicId: true,
          currentSemester: true,
          graduationYear: true,
          employmentStatus: true,
          currentCompany: true,
          position: true,
          avatarUrl: true,
          verified: true,
          verificationStatus: true,
          rejectionReason: true,
          verifiedAt: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.user.count({ where }),
    ]);
  },

  listAdminUsers(universityId: string, filters: AdminUserFilters) {
    const where: Prisma.UserWhereInput = {
      universityId,
      ...(filters.role ? { role: { name: filters.role } } : {}),
      ...(filters.status ? { isActive: filters.status === 'ACTIVE' } : {}),
      ...(filters.verificationStatus ? { verificationStatus: filters.verificationStatus } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
              { department: { contains: filters.search, mode: 'insensitive' } },
              { batch: { contains: filters.search, mode: 'insensitive' } },
              { studentId: { contains: filters.search, mode: 'insensitive' } },
              { academicId: { contains: filters.search, mode: 'insensitive' } },
              { currentCompany: { contains: filters.search, mode: 'insensitive' } },
              { position: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          batch: true,
          department: true,
          studentId: true,
          academicId: true,
          currentSemester: true,
          graduationYear: true,
          employmentStatus: true,
          currentCompany: true,
          position: true,
          avatarUrl: true,
          verified: true,
          verificationStatus: true,
          isActive: true,
          isDemo: true,
          needPasswordChange: true,
          createdAt: true,
          updatedAt: true,
          role: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.user.count({ where }),
    ]);
  },

  async findUserDetailForAdmin(userId: string, universityId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, universityId },
      include: {
        role: { select: { id: true, name: true, description: true } },
        university: { select: { id: true, name: true, slug: true, domain: true } },
        refreshTokens: {
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) return null;

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        universityId,
        OR: [{ targetId: userId }, { actorId: userId }],
      },
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        createdAt: true,
        metadata: true,
        actor: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const { passwordHash, ...safeUser } = user;
    return {
      ...safeUser,
      auditLogs,
    };
  },

  verifyForUniversity(userId: string, universityId: string) {
    return prisma.user.update({
      where: { id: userId, universityId },
      data: {
        verified: true,
        verificationStatus: 'APPROVED',
        verifiedAt: new Date(),
        rejectionReason: null,
      },
      select: { id: true, name: true, email: true, verified: true, verificationStatus: true },
    });
  },

  reviewVerification(
    userId: string,
    universityId: string,
    status: 'APPROVED' | 'REJECTED' | 'REVOKED',
    reason?: string,
  ) {
    if (status === 'APPROVED') {
      return prisma.user.update({
        where: { id: userId, universityId },
        data: {
          verified: true,
          verificationStatus: 'APPROVED',
          verifiedAt: new Date(),
          rejectionReason: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          verified: true,
          verificationStatus: true,
          rejectionReason: true,
          verifiedAt: true,
          role: { select: { name: true } },
        },
      });
    }

    if (status === 'REVOKED') {
      return prisma.user.update({
        where: { id: userId, universityId },
        data: {
          verificationStatus: 'PENDING',
          verifiedAt: null,
          rejectionReason: reason ?? 'Accreditation revoked by administrator.',
        },
        select: {
          id: true,
          name: true,
          email: true,
          verified: true,
          verificationStatus: true,
          rejectionReason: true,
          verifiedAt: true,
          role: { select: { name: true } },
        },
      });
    }

    // REJECTED: Notice that verified is NOT modified. Existing email verification status is strictly preserved.
    return prisma.user.update({
      where: { id: userId, universityId },
      data: {
        verificationStatus: 'REJECTED',
        verifiedAt: null,
        rejectionReason: reason,
      },
      select: {
        id: true,
        name: true,
        email: true,
        verified: true,
        verificationStatus: true,
        rejectionReason: true,
        verifiedAt: true,
        role: { select: { name: true } },
      },
    });
  },

  updateAvatar(userId: string, universityId: string, avatarUrl: string | null) {
    return prisma.user.update({
      where: { id: userId, universityId },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  },
};
