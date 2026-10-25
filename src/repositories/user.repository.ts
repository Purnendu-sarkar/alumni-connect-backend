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
      ...(filters.status ? { verificationStatus: filters.status } : {}),
      ...(filters.role ? { role: { name: filters.role } } : {}),
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
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const isApproved = status === 'APPROVED';
    return prisma.user.update({
      where: { id: userId, universityId },
      data: {
        verified: isApproved,
        verificationStatus: status,
        verifiedAt: isApproved ? new Date() : null,
        rejectionReason: isApproved ? null : reason,
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
