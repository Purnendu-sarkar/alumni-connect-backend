import type { Prisma, RoleName } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';

export const adminRepository = {
  async getDashboardStats(universityId: string) {
    const [
      totalStudents,
      totalAlumni,
      totalModerators,
      totalAdmins,
      approvedUsers,
      pendingVerifications,
      pendingEmailVerifications,
      suspendedUsers,
      emailVerifiedCount,
      adminVerifiedCount,
      rejectedVerificationCount,
      totalJobs,
      pendingJobs,
      closedJobs,
      totalApplications,
      shortlistedApplications,
      acceptedApplications,
      totalEvents,
      upcomingEvents,
      totalEventRsvps,
      totalAnnouncements,
      publishedStories,
      openReports,
      resolvedReports,
      totalConnections,
      acceptedConnections,
      pendingConnections,
      totalMentorships,
      activeMentorships,
      completedMentorships,
      pendingMentorships,
      auditLogsCount,
      deptGroups,
      officialDepts,
      roles,
    ] = await Promise.all([
      prisma.user.count({ where: { universityId, role: { name: 'STUDENT' } } }),
      prisma.user.count({ where: { universityId, role: { name: 'ALUMNI' } } }),
      prisma.user.count({ where: { universityId, role: { name: 'MODERATOR' } } }),
      prisma.user.count({ where: { universityId, role: { name: 'SUPER_ADMIN' } } }),
      prisma.user.count({
        where: {
          universityId,
          isActive: true,
          verified: true,
          verificationStatus: 'APPROVED',
        },
      }),
      prisma.user.count({
        where: {
          universityId,
          role: { name: 'ALUMNI' },
          verificationStatus: 'PENDING',
          verified: true,
        },
      }),
      prisma.user.count({
        where: {
          universityId,
          role: { name: 'ALUMNI' },
          verificationStatus: 'PENDING',
          verified: false,
        },
      }),
      prisma.user.count({ where: { universityId, isActive: false } }),
      prisma.user.count({
        where: {
          universityId,
          verified: true,
          role: { name: { in: ['STUDENT', 'ALUMNI'] } },
        },
      }),
      prisma.user.count({
        where: {
          universityId,
          verificationStatus: 'APPROVED',
          role: { name: { in: ['STUDENT', 'ALUMNI'] } },
        },
      }),
      prisma.user.count({
        where: {
          universityId,
          verificationStatus: 'REJECTED',
        },
      }),
      prisma.job.count({
        where: {
          universityId,
          status: 'PUBLISHED',
          deletedAt: null,
        },
      }),
      prisma.job.count({
        where: {
          universityId,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
          deletedAt: null,
        },
      }),
      prisma.job.count({
        where: {
          universityId,
          status: 'CLOSED',
          deletedAt: null,
        },
      }),
      prisma.jobApplication.count({
        where: { job: { universityId } },
      }),
      prisma.jobApplication.count({
        where: { job: { universityId }, status: 'SHORTLISTED' },
      }),
      prisma.jobApplication.count({
        where: { job: { universityId }, status: 'ACCEPTED' },
      }),
      prisma.event.count({
        where: { universityId, status: 'PUBLISHED' },
      }),
      prisma.event.count({
        where: { universityId, status: 'PUBLISHED', startsAt: { gte: new Date() } },
      }),
      prisma.eventRsvp.count({
        where: { event: { universityId }, status: 'GOING' },
      }),
      prisma.announcement.count({
        where: { universityId, status: 'PUBLISHED' },
      }),
      prisma.successStory.count({
        where: { universityId, status: 'PUBLISHED' },
      }),
      prisma.report.count({
        where: { universityId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      }),
      prisma.report.count({
        where: { universityId, status: 'RESOLVED' },
      }),
      prisma.connection.count({
        where: { universityId },
      }),
      prisma.connection.count({
        where: { universityId, status: 'ACCEPTED' },
      }),
      prisma.connection.count({
        where: { universityId, status: 'PENDING' },
      }),
      prisma.mentorshipRequest.count({
        where: { universityId },
      }),
      prisma.mentorshipRequest.count({
        where: { universityId, status: { in: ['ACCEPTED', 'ACTIVE'] } },
      }),
      prisma.mentorshipRequest.count({
        where: { universityId, status: 'COMPLETED' },
      }),
      prisma.mentorshipRequest.count({
        where: { universityId, status: { in: ['REQUESTED', 'PENDING'] } },
      }),
      prisma.auditLog.count({ where: { universityId } }),
      prisma.user.groupBy({
        by: ['department', 'roleId'],
        where: {
          universityId,
          department: { not: null },
        },
        _count: { id: true },
      }),
      prisma.department.findMany({
        where: { universityId },
        select: { id: true, code: true, name: true },
      }),
      prisma.role.findMany({
        select: { id: true, name: true },
      }),
    ]);

    const totalUsers = totalStudents + totalAlumni + totalModerators + totalAdmins;

    const studentRoleId = roles.find((r) => r.name === 'STUDENT')?.id;
    const alumniRoleId = roles.find((r) => r.name === 'ALUMNI')?.id;

    const deptMap = new Map<
      string,
      { department: string; code?: string; students: number; alumni: number; total: number }
    >();

    for (const d of officialDepts) {
      deptMap.set(d.name, {
        department: d.name,
        code: d.code,
        students: 0,
        alumni: 0,
        total: 0,
      });
    }

    for (const g of deptGroups) {
      if (!g.department) continue;
      const existing = deptMap.get(g.department) || {
        department: g.department,
        students: 0,
        alumni: 0,
        total: 0,
      };
      if (g.roleId === studentRoleId) {
        existing.students += g._count.id;
      } else if (g.roleId === alumniRoleId) {
        existing.alumni += g._count.id;
      }
      existing.total = existing.students + existing.alumni;
      deptMap.set(g.department, existing);
    }

    const departmentBreakdown = Array.from(deptMap.values())
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      scope: 'PLATFORM',
      // Backward-compatible keys
      totalUsers,
      totalStudents,
      totalAlumni,
      totalModerators,
      totalAdmins,
      approvedUsers,
      pendingVerifications,
      pendingEmailVerifications,
      totalJobs,
      pendingJobs,
      auditLogsCount,

      // Enriched Role & Governance metrics
      totalSuperAdmins: totalAdmins,
      suspendedUsers,

      // Verification Funnel
      registeredCount: totalStudents + totalAlumni,
      emailVerifiedCount,
      adminVerifiedCount,
      rejectedVerificationCount,

      // Network & Mentorship Velocity
      totalConnections,
      acceptedConnections,
      pendingConnections,
      totalMentorships,
      activeMentorships,
      completedMentorships,
      pendingMentorships,

      // Jobs & Applications Pipeline
      publishedJobs: totalJobs,
      pendingReviewJobs: pendingJobs,
      closedJobs,
      totalApplications,
      shortlistedApplications,
      acceptedApplications,

      // Events, Content & Moderation
      totalEvents,
      upcomingEvents,
      totalEventRsvps,
      totalAnnouncements,
      publishedStories,
      openReports,
      resolvedReports,
      totalAuditLogs: auditLogsCount,

      // Departmental Campus Breakdown
      departmentBreakdown,
    };
  },

  findRoleByName(name: RoleName) {
    return prisma.role.findUnique({
      where: { name },
      select: { id: true, name: true, description: true },
    });
  },

  countActiveSuperAdmins(universityId: string) {
    return prisma.user.count({
      where: {
        universityId,
        role: { name: 'SUPER_ADMIN' },
        isActive: true,
      },
    });
  },

  async findDuplicateIdCounts(
    universityId: string,
    studentIds: string[],
    academicIds: string[],
  ) {
    const studentMap = new Map<string, number>();
    const academicMap = new Map<string, number>();

    if (studentIds.length > 0) {
      const groupedStudents = await prisma.user.groupBy({
        by: ['studentId'],
        where: { universityId, studentId: { in: studentIds } },
        _count: { id: true },
      });
      for (const row of groupedStudents) {
        if (row.studentId) studentMap.set(row.studentId, row._count.id);
      }
    }

    if (academicIds.length > 0) {
      const groupedAcademic = await prisma.user.groupBy({
        by: ['academicId'],
        where: { universityId, academicId: { in: academicIds } },
        _count: { id: true },
      });
      for (const row of groupedAcademic) {
        if (row.academicId) academicMap.set(row.academicId, row._count.id);
      }
    }

    return { studentMap, academicMap };
  },

  async listModeratorsWithStats(universityId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);

    const moderators = await prisma.user.findMany({
      where: {
        universityId,
        role: { name: 'MODERATOR' },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        department: true,
        isActive: true,
        verified: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    const moderatorIds = moderators.map((m) => m.id);
    if (moderatorIds.length === 0) {
      return [];
    }

    const [jobsReviewedRows, storiesReviewedRows, claimedJobsRows, claimedStoriesRows] =
      await Promise.all([
        prisma.jobModerationRecord.groupBy({
          by: ['actorId'],
          where: {
            actorId: { in: moderatorIds },
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
        }),
        prisma.storyModerationRecord.groupBy({
          by: ['moderatorId'],
          where: {
            moderatorId: { in: moderatorIds },
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
        }),
        prisma.job.groupBy({
          by: ['reviewerId'],
          where: {
            universityId,
            reviewerId: { in: moderatorIds },
            status: 'UNDER_REVIEW',
            deletedAt: null,
          },
          _count: { id: true },
        }),
        prisma.successStory.groupBy({
          by: ['reviewerId'],
          where: {
            universityId,
            reviewerId: { in: moderatorIds },
            status: 'UNDER_REVIEW',
            deletedAt: null,
          },
          _count: { id: true },
        }),
      ]);

    const jobsReviewedMap = new Map(jobsReviewedRows.map((r) => [r.actorId, r._count.id]));
    const storiesReviewedMap = new Map(storiesReviewedRows.map((r) => [r.moderatorId, r._count.id]));
    const claimedJobsMap = new Map(
      claimedJobsRows.filter((r) => r.reviewerId).map((r) => [r.reviewerId!, r._count.id]),
    );
    const claimedStoriesMap = new Map(
      claimedStoriesRows.filter((r) => r.reviewerId).map((r) => [r.reviewerId!, r._count.id]),
    );

    return moderators.map((mod) => {
      const stats = {
        jobsReviewed30d: jobsReviewedMap.get(mod.id) ?? 0,
        storiesReviewed30d: storiesReviewedMap.get(mod.id) ?? 0,
        activeClaimedJobs: claimedJobsMap.get(mod.id) ?? 0,
        activeClaimedStories: claimedStoriesMap.get(mod.id) ?? 0,
      };
      return {
        ...mod,
        stats,
        activityStats: stats,
      };
    });
  },

  async removeModeratorTransaction(userId: string, universityId: string) {
    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId, universityId },
        data: { isActive: false },
        select: { id: true, name: true, email: true, isActive: true },
      });

      const releasedJobs = await tx.job.updateMany({
        where: {
          universityId,
          reviewerId: userId,
          status: 'UNDER_REVIEW',
          deletedAt: null,
        },
        data: {
          status: 'SUBMITTED',
          reviewerId: null,
          claimedAt: null,
          version: { increment: 1 },
        },
      });

      const releasedStories = await tx.successStory.updateMany({
        where: {
          universityId,
          reviewerId: userId,
          status: 'UNDER_REVIEW',
          deletedAt: null,
        },
        data: {
          status: 'SUBMITTED',
          reviewerId: null,
          claimedAt: null,
          version: { increment: 1 },
        },
      });

      return {
        user: updatedUser,
        releasedJobsCount: releasedJobs.count,
        releasedStoriesCount: releasedStories.count,
      };
    });
  },

  listModeratorInvitations() {
    return prisma.moderatorInvitation.findMany({
      include: {
        invitedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findModeratorInvitationById(id: string) {
    return prisma.moderatorInvitation.findUnique({ where: { id } });
  },

  upsertModeratorInvitation(input: {
    email: string;
    tokenHash: string;
    expiresAt: Date;
    actorId: string;
  }) {
    return prisma.moderatorInvitation.upsert({
      where: { email: input.email },
      update: {
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        acceptedAt: null,
        invitedBy: { connect: { id: input.actorId } },
      },
      create: {
        email: input.email,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        invitedBy: { connect: { id: input.actorId } },
      },
    });
  },

  updateModeratorInvitation(
    id: string,
    data: { tokenHash?: string; expiresAt?: Date; revokedAt?: Date | null },
  ) {
    return prisma.moderatorInvitation.update({
      where: { id },
      data,
    });
  },

  async getRolesAndAdminsOverview(universityId: string) {
    const [roles, superAdmins, recentRoleAuditLogs, studentCount, alumniCount, moderatorCount, adminCount] =
      await Promise.all([
        prisma.role.findMany({
          select: { id: true, name: true, description: true },
        }),
        prisma.user.findMany({
          where: { universityId, role: { name: 'SUPER_ADMIN' } },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            isActive: true,
            verified: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.auditLog.findMany({
          where: {
            universityId,
            action: {
              in: [
                'ROLE_CHANGED',
                'MODERATOR_INVITED',
                'MODERATOR_REMOVED',
                'MODERATOR_INVITATION_REVOKED',
                'SUPER_ADMIN_INVITED',
                'SUPER_ADMIN_REMOVED',
              ],
            },
          },
          select: {
            id: true,
            action: true,
            targetType: true,
            targetId: true,
            metadata: true,
            createdAt: true,
            actor: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.user.count({ where: { universityId, role: { name: 'STUDENT' } } }),
        prisma.user.count({ where: { universityId, role: { name: 'ALUMNI' } } }),
        prisma.user.count({ where: { universityId, role: { name: 'MODERATOR' } } }),
        prisma.user.count({ where: { universityId, role: { name: 'SUPER_ADMIN' } } }),
      ]);

    const countMap: Record<RoleName, number> = {
      STUDENT: studentCount,
      ALUMNI: alumniCount,
      MODERATOR: moderatorCount,
      SUPER_ADMIN: adminCount,
    };

    return {
      roles,
      countMap,
      superAdmins,
      recentRoleAuditLogs,
    };
  },

  listUniversities() {
    return prisma.university.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        isActive: true,
        isDemo: true,
        createdAt: true,
        _count: { select: { users: true, jobs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findUniversityBySlugOrDomain(slug: string, domain: string) {
    return prisma.university.findFirst({
      where: { OR: [{ slug }, { domain }] },
    });
  },

  createUniversity(data: { name: string; slug: string; domain: string }) {
    return prisma.university.create({
      data: {
        name: data.name,
        slug: data.slug,
        domain: data.domain,
        isActive: true,
      },
    });
  },

  updateUniversityStatus(universityId: string, isActive: boolean) {
    return prisma.university.update({
      where: { id: universityId },
      data: { isActive },
    });
  },

  getUniversitySettings(universityId: string) {
    return prisma.university.findUnique({
      where: { id: universityId },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        isActive: true,
        settings: true,
      },
    });
  },

  updateUniversitySettings(
    universityId: string,
    data: { name?: string; domain?: string; settings: Prisma.InputJsonValue },
  ) {
    return prisma.university.update({
      where: { id: universityId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.domain ? { domain: data.domain } : {}),
        settings: data.settings,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        isActive: true,
        settings: true,
      },
    });
  },

  findActiveUserIdsByRoles(universityId: string, roles: RoleName[]) {
    return prisma.user.findMany({
      where: {
        universityId,
        isActive: true,
        role: { name: { in: roles } },
      },
      select: { id: true },
    });
  },

  createNotificationBatch(notifications: Prisma.NotificationCreateManyInput[]) {
    return prisma.notification.createMany({
      data: notifications,
    });
  },

  findRecentBroadcastAuditLogs(universityId: string, limit = 20) {
    return prisma.auditLog.findMany({
      where: {
        universityId,
        action: 'SYSTEM_BROADCAST_SENT',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },
};
