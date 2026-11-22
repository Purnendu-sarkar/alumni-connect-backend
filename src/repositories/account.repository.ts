import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';

export const accountRepository = {
  findAccountUser(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { name: true } },
        university: { select: { id: true, name: true, domain: true } },
        dataExports: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });
  },

  findUserWithPassword(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        universityId: true,
        role: { select: { name: true } },
      },
    });
  },

  createDataExportRequest(input: {
    userId: string;
    payload: Prisma.InputJsonValue;
    expiresAt: Date;
  }) {
    return prisma.dataExportRequest.create({
      data: {
        userId: input.userId,
        status: 'COMPLETED',
        payload: input.payload,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  },

  findRecentDataExport(userId: string, withinMs: number) {
    const since = new Date(Date.now() - withinMs);
    return prisma.dataExportRequest.findFirst({
      where: {
        userId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async deactivateUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
      },
    });
  },

  async requestUserDeletion(userId: string) {
    const now = new Date();
    return prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletionRequestedAt: now,
        deletedAt: now,
      },
    });
  },

  async closeUserJobs(userId: string) {
    return prisma.job.updateMany({
      where: {
        postedById: userId,
        status: 'PUBLISHED',
      },
      data: {
        status: 'CLOSED',
      },
    });
  },

  async compileSanitizedUserData(userId: string) {
    const [
      user,
      privacy,
      sentConnections,
      receivedConnections,
      mentoringRequests,
      menteeRequests,
      jobApplications,
      eventRsvps,
      stories,
      notifications,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
          batch: true,
          studentId: true,
          academicId: true,
          graduationYear: true,
          currentCompany: true,
          position: true,
          bio: true,
          headline: true,
          location: true,
          phone: true,
          skills: true,
          interests: true,
          verified: true,
          verificationStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.privacySetting.findUnique({
        where: { userId },
        select: {
          profileVisibility: true,
          emailVisibility: true,
          phoneVisibility: true,
          locationVisibility: true,
          careerVisibility: true,
          educationVisibility: true,
          skillsVisibility: true,
          connectionsVisibility: true,
          mentorshipVisibility: true,
          searchVisibility: true,
          messagingPermission: true,
          updatedAt: true,
        },
      }),
      prisma.connection.findMany({
        where: { requesterId: userId },
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          recipient: { select: { id: true, name: true, department: true } },
        },
      }),
      prisma.connection.findMany({
        where: { recipientId: userId },
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
          requester: { select: { id: true, name: true, department: true } },
        },
      }),
      prisma.mentorshipRequest.findMany({
        where: { mentorId: userId },
        select: {
          id: true,
          status: true,
          topic: true,
          notes: true,
          createdAt: true,
          mentee: { select: { id: true, name: true, department: true } },
        },
      }),
      prisma.mentorshipRequest.findMany({
        where: { menteeId: userId },
        select: {
          id: true,
          status: true,
          topic: true,
          notes: true,
          createdAt: true,
          mentor: { select: { id: true, name: true, department: true } },
        },
      }),
      prisma.jobApplication.findMany({
        where: { applicantId: userId },
        select: {
          id: true,
          status: true,
          coverLetter: true,
          appliedAt: true,
          job: { select: { id: true, title: true, company: true } },
        },
      }),
      prisma.eventRsvp.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          event: { select: { id: true, title: true, startTime: true, location: true } },
        },
      }),
      prisma.successStory.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          summary: true,
          content: true,
          status: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.findMany({
        where: { userId },
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          read: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      account: user,
      privacySettings: privacy,
      network: {
        sentConnections,
        receivedConnections,
      },
      mentorship: {
        asMentor: mentoringRequests,
        asMentee: menteeRequests,
      },
      career: {
        jobApplications,
      },
      events: {
        rsvps: eventRsvps,
      },
      content: {
        authoredStories: stories,
      },
      notifications,
    };
  },
};
