import type { Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export interface DirectoryQueryFilters {
  group?: 'alumni' | 'students';
  q?: string;
  department?: string;
  gradYear?: string;
  industry?: string;
  location?: string;
  skills?: string[];
  mentorship?: boolean | string;
  sort?: 'name' | 'graduationYear' | 'recentlyJoined';
  page?: number;
  limit?: number;
}

export const directoryRepository = {
  async searchCandidates(
    universityId: string,
    group: 'alumni' | 'students',
    filters: DirectoryQueryFilters,
    excludedUserIds: string[],
  ) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      universityId,
      isActive: true,
      verified: true,
      id: { notIn: excludedUserIds },
      role: { name: group === 'students' ? 'STUDENT' : 'ALUMNI' },
      ...(group === 'alumni' ? { verificationStatus: 'APPROVED' } : {}),
      OR: [
        { privacySetting: { is: null } },
        { privacySetting: { searchVisibility: { not: 'ONLY_ME' } } },
      ],
    };

    if (filters.department) {
      const dept = filters.department.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { departmentId: dept },
            { department: { equals: dept, mode: 'insensitive' } },
            { departmentRef: { code: { equals: dept, mode: 'insensitive' } } },
            { departmentRef: { name: { equals: dept, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    if (filters.gradYear) {
      const year = filters.gradYear.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { graduationYear: { equals: year, mode: 'insensitive' } },
            { batch: { equals: year, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (filters.location) {
      where.location = { contains: filters.location.trim(), mode: 'insensitive' };
    }

    if (filters.industry) {
      const ind = filters.industry.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { currentCompany: { contains: ind, mode: 'insensitive' } },
            { headline: { contains: ind, mode: 'insensitive' } },
            { bio: { contains: ind, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (filters.skills && filters.skills.length > 0) {
      where.skills = { hasSome: filters.skills };
    }

    if (filters.mentorship === true || filters.mentorship === 'true' || filters.mentorship === 'OPEN') {
      where.isMentorshipAvailable = true;
      where.mentorshipStatus = 'OPEN';
    }

    if (filters.q?.trim()) {
      const query = filters.q.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { currentCompany: { contains: query, mode: 'insensitive' } },
            { position: { contains: query, mode: 'insensitive' } },
            { headline: { contains: query, mode: 'insensitive' } },
            { department: { contains: query, mode: 'insensitive' } },
            { bio: { contains: query, mode: 'insensitive' } },
            { skills: { has: query } },
          ],
        },
      ];
    }

    let orderBy: Prisma.UserOrderByWithRelationInput[];
    if (filters.sort === 'name') {
      orderBy = [{ name: 'asc' }];
    } else if (filters.sort === 'graduationYear') {
      orderBy = [{ graduationYear: 'desc' }, { batch: 'desc' }];
    } else {
      orderBy = [{ createdAt: 'desc' }];
    }

    const [candidates, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phonePublic: true,
          batch: true,
          department: true,
          departmentId: true,
          departmentRef: {
            select: { id: true, name: true, code: true, faculty: true },
          },
          currentCompany: true,
          position: true,
          headline: true,
          bio: true,
          location: true,
          skills: true,
          interests: true,
          avatarUrl: true,
          avatarPublicId: true,
          verified: true,
          verificationStatus: true,
          graduationYear: true,
          employmentStatus: true,
          isMentorshipAvailable: true,
          mentorshipStatus: true,
          maxActiveMentees: true,
          mentorshipTopics: true,
          linkedinUrl: true,
          githubUrl: true,
          websiteUrl: true,
          createdAt: true,
          role: { select: { name: true } },
          privacySetting: true,
          mentoringRequests: {
            where: { status: 'ACTIVE' },
            select: { id: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { candidates, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  findMemberById(universityId: string, memberId: string) {
    return prisma.user.findFirst({
      where: {
        id: memberId,
        universityId,
        isActive: true,
        verified: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phonePublic: true,
        batch: true,
        department: true,
        departmentId: true,
        departmentRef: {
          select: { id: true, name: true, code: true, faculty: true },
        },
        currentCompany: true,
        position: true,
        headline: true,
        bio: true,
        location: true,
        skills: true,
        interests: true,
        avatarUrl: true,
        avatarPublicId: true,
        verified: true,
        verificationStatus: true,
        graduationYear: true,
        admissionYear: true,
        expectedGraduationYear: true,
        studentId: true,
        academicId: true,
        currentSemester: true,
        employmentStatus: true,
        isMentorshipAvailable: true,
        mentorshipStatus: true,
        maxActiveMentees: true,
        mentorshipTopics: true,
        linkedinUrl: true,
        githubUrl: true,
        websiteUrl: true,
        createdAt: true,
        role: { select: { name: true } },
        privacySetting: true,
        university: {
          select: { id: true, name: true, slug: true },
        },
        mentoringRequests: {
          where: { status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });
  },
};
