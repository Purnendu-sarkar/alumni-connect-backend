import type { MentorshipStatus, Prisma } from '../generated/prisma/client.js';

import { prisma } from '../config/database.js';

export interface CreateMentorshipRequestInput {
  universityId: string;
  mentorId: string;
  menteeId: string;
  topic: string;
  careerGoal: string;
  message: string;
  preferredCommunication: string;
  availability: string;
  expectedDuration?: string;
}

export const mentorshipRepository = {
  createRequest(input: CreateMentorshipRequestInput) {
    return prisma.mentorshipRequest.create({
      data: {
        ...input,
        goals: input.careerGoal,
        status: 'REQUESTED',
      },
      include: {
        mentor: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            email: true,
          },
        },
        mentee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            batch: true,
            email: true,
          },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.mentorshipRequest.findUnique({
      where: { id },
      include: {
        mentor: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            email: true,
            maxActiveMentees: true,
            mentorshipStatus: true,
          },
        },
        mentee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            batch: true,
            email: true,
          },
        },
      },
    });
  },

  findActiveBetweenUsers(studentId: string, alumniId: string) {
    return prisma.mentorshipRequest.findFirst({
      where: {
        menteeId: studentId,
        mentorId: alumniId,
        status: { in: ['REQUESTED', 'CLARIFICATION_REQUESTED', 'ACTIVE', 'PENDING', 'ACCEPTED'] },
      },
    });
  },

  countActiveMentees(mentorId: string) {
    return prisma.mentorshipRequest.count({
      where: {
        mentorId,
        status: { in: ['ACTIVE', 'ACCEPTED'] },
      },
    });
  },

  async listForUser(
    userId: string,
    role: 'STUDENT' | 'ALUMNI',
    filters: {
      status?: MentorshipStatus | MentorshipStatus[];
      group?: 'requests' | 'active' | 'history';
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
    const skip = (page - 1) * limit;

    const where: Prisma.MentorshipRequestWhereInput = {
      ...(role === 'STUDENT' ? { menteeId: userId } : { mentorId: userId }),
    };

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        where.status = { in: filters.status };
      } else {
        where.status = filters.status;
      }
    } else if (filters.group === 'requests') {
      where.status = { in: ['REQUESTED', 'CLARIFICATION_REQUESTED', 'PENDING'] };
    } else if (filters.group === 'active') {
      where.status = { in: ['ACTIVE', 'ACCEPTED'] };
    } else if (filters.group === 'history') {
      where.status = { in: ['COMPLETED', 'CANCELLED', 'REJECTED', 'DECLINED'] };
    }

    const [items, total] = await Promise.all([
      prisma.mentorshipRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          mentor: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              department: true,
              currentCompany: true,
              position: true,
              email: true,
            },
          },
          mentee: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              department: true,
              batch: true,
              email: true,
            },
          },
        },
      }),
      prisma.mentorshipRequest.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  updateStatus(
    id: string,
    status: MentorshipStatus,
    data: Partial<{
      clarificationQuestion: string | null;
      clarificationReply: string | null;
      decisionNote: string | null;
      startedAt: Date | null;
      endedAt: Date | null;
      endedById: string | null;
      endNote: string | null;
      scheduledAt: Date | null;
    }> = {},
  ) {
    return prisma.mentorshipRequest.update({
      where: { id },
      data: {
        status,
        ...data,
      },
      include: {
        mentor: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            email: true,
          },
        },
        mentee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            batch: true,
            email: true,
          },
        },
      },
    });
  },

  updateAlumniNote(id: string, alumniNote: string, scheduledAt?: Date | null) {
    return prisma.mentorshipRequest.update({
      where: { id },
      data: {
        alumniNote,
        ...(scheduledAt !== undefined ? { scheduledAt } : {}),
      },
      include: {
        mentor: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            currentCompany: true,
            position: true,
            email: true,
          },
        },
        mentee: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            batch: true,
            email: true,
          },
        },
      },
    });
  },

  async countPlatformStats(universityId: string) {
    const [totalActive, totalRequested, totalCompleted, totalCancelled, totalRejected] =
      await Promise.all([
        prisma.mentorshipRequest.count({
          where: { universityId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
        }),
        prisma.mentorshipRequest.count({
          where: { universityId, status: { in: ['REQUESTED', 'CLARIFICATION_REQUESTED', 'PENDING'] } },
        }),
        prisma.mentorshipRequest.count({
          where: { universityId, status: 'COMPLETED' },
        }),
        prisma.mentorshipRequest.count({
          where: { universityId, status: 'CANCELLED' },
        }),
        prisma.mentorshipRequest.count({
          where: { universityId, status: { in: ['REJECTED', 'DECLINED'] } },
        }),
      ]);

    return {
      totalActive,
      totalRequested,
      totalCompleted,
      totalCancelled,
      totalRejected,
      totalMentorships: totalActive + totalRequested + totalCompleted + totalCancelled + totalRejected,
    };
  },
};
