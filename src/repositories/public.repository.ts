import { prisma } from '../config/database.js';
import { JobStatus, EventStatus, AnnouncementStatus, StoryStatus, PrivacyScope } from '../generated/prisma/client.js';

export const publicRepository = {
  async getUniversityBySlug(slug: string) {
    return prisma.university.findFirst({
      where: {
        OR: [{ slug }, { slug: 'demo' }],
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
      },
    });
  },

  async getMetrics(universityId: string) {
    const [
      studentsCount,
      alumniCount,
      publishedJobsCount,
      publishedEventsCount,
      publishedStoriesCount,
      publishedAnnouncementsCount,
    ] = await Promise.all([
      prisma.user.count({
        where: {
          universityId,
          isActive: true,
          verificationStatus: 'APPROVED',
          role: { name: 'STUDENT' },
        },
      }),
      prisma.user.count({
        where: {
          universityId,
          isActive: true,
          verificationStatus: 'APPROVED',
          role: { name: 'ALUMNI' },
        },
      }),
      prisma.job.count({
        where: {
          universityId,
          status: JobStatus.PUBLISHED,
        },
      }),
      prisma.event.count({
        where: {
          universityId,
          status: EventStatus.PUBLISHED,
        },
      }),
      prisma.successStory.count({
        where: {
          universityId,
          status: StoryStatus.PUBLISHED,
        },
      }),
      prisma.announcement.count({
        where: {
          universityId,
          status: AnnouncementStatus.PUBLISHED,
        },
      }),
    ]);

    return {
      totalMembers: studentsCount + alumniCount,
      studentsCount,
      alumniCount,
      publishedJobsCount,
      publishedEventsCount,
      publishedStoriesCount,
      publishedAnnouncementsCount,
    };
  },

  async getDepartmentDistribution(universityId: string) {
    const departments = await prisma.department.findMany({
      where: {
        universityId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        faculty: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    const userCounts = await prisma.user.groupBy({
      by: ['departmentId', 'roleId'],
      where: {
        universityId,
        isActive: true,
        verificationStatus: 'APPROVED',
        departmentId: { not: null },
      },
      _count: {
        id: true,
      },
    });

    const roles = await prisma.role.findMany({
      where: { name: { in: ['STUDENT', 'ALUMNI'] } },
      select: { id: true, name: true },
    });

    const studentRoleId = roles.find((r) => r.name === 'STUDENT')?.id;
    const alumniRoleId = roles.find((r) => r.name === 'ALUMNI')?.id;

    const distribution = departments.map((dept) => {
      let studentCount = 0;
      let alumniCount = 0;

      for (const group of userCounts) {
        if (group.departmentId === dept.id) {
          if (group.roleId === studentRoleId) {
            studentCount += group._count.id;
          } else if (group.roleId === alumniRoleId) {
            alumniCount += group._count.id;
          }
        }
      }

      return {
        id: dept.id,
        code: dept.code,
        name: dept.name,
        faculty: dept.faculty,
        studentCount,
        alumniCount,
        totalCount: studentCount + alumniCount,
      };
    });

    return distribution.sort((a, b) => b.totalCount - a.totalCount);
  },

  async getFeaturedAlumni(universityId: string, limit = 4) {
    return prisma.user.findMany({
      where: {
        universityId,
        isActive: true,
        verificationStatus: 'APPROVED',
        role: { name: 'ALUMNI' },
        AND: [
          {
            OR: [
              { privacySetting: null },
              {
                privacySetting: {
                  searchVisibility: { not: PrivacyScope.ONLY_ME },
                  profileVisibility: { not: PrivacyScope.ONLY_ME },
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        headline: true,
        currentCompany: true,
        position: true,
        department: true,
        graduationYear: true,
        isMentorshipAvailable: true,
      },
      orderBy: [
        { avatarUrl: 'desc' },
        { currentCompany: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  },

  async getFeaturedJobs(universityId: string, limit = 3) {
    return prisma.job.findMany({
      where: {
        universityId,
        status: JobStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        employmentType: true,
        workMode: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        deadline: true,
        publishedAt: true,
        createdAt: true,
        description: true,
      },
      orderBy: [
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  },

  async getFeaturedStories(universityId: string, limit = 3) {
    return prisma.successStory.findMany({
      where: {
        universityId,
        status: StoryStatus.PUBLISHED,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        body: true,
        coverImageUrl: true,
        publishedAt: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            name: true,
            department: true,
            graduationYear: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  },

  async getFeaturedEvents(universityId: string, limit = 2) {
    const now = new Date();
    const upcoming = await prisma.event.findMany({
      where: {
        universityId,
        status: EventStatus.PUBLISHED,
        startsAt: { gte: now },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        bannerUrl: true,
        mode: true,
        venue: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
    });

    if (upcoming.length >= limit) {
      return upcoming;
    }

    const fallbackEvents = await prisma.event.findMany({
      where: {
        universityId,
        status: EventStatus.PUBLISHED,
        id: { notIn: upcoming.map((e) => e.id) },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        bannerUrl: true,
        mode: true,
        venue: true,
        startsAt: true,
        endsAt: true,
      },
      orderBy: { startsAt: 'desc' },
      take: limit - upcoming.length,
    });

    return [...upcoming, ...fallbackEvents];
  },

  async getLatestAnnouncements(universityId: string, limit = 3) {
    return prisma.announcement.findMany({
      where: {
        universityId,
        status: AnnouncementStatus.PUBLISHED,
      },
      select: {
        id: true,
        title: true,
        category: true,
        pinned: true,
        publishedAt: true,
        createdAt: true,
        body: true,
      },
      orderBy: [
        { pinned: 'desc' },
        { publishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });
  },
};
