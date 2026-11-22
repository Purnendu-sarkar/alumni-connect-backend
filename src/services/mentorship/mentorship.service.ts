import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { mentorshipPresenter } from '../../presenters/mentorship.presenter.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { mentorshipRepository } from '../../repositories/mentorship.repository.js';
import { restrictionRepository } from '../../repositories/restriction.repository.js';
import { userRepository } from '../../repositories/user.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { notificationService } from '../notification/notification.service.js';

export const mentorshipService = {
  async createRequest(input: {
    universityId: string;
    studentId: string;
    mentorId: string;
    topic: string;
    careerGoal: string;
    message: string;
    preferredCommunication: string;
    availability: string;
    expectedDuration?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const activeRestriction = await restrictionRepository.findActiveRestriction(
      input.studentId,
      'MENTORSHIP_REQUESTS',
    );
    if (activeRestriction) {
      throw new ApiError(
        403,
        `Your mentorship request privileges are temporarily restricted until ${activeRestriction.endsAt.toISOString()}`,
        'USER_RESTRICTED',
      );
    }

    if (input.studentId === input.mentorId) {
      throw ApiError.badRequest('You cannot request mentorship from yourself.');
    }

    // 1. Check bidirectional block
    const isBlocked = await blockRepository.findBlock(input.studentId, input.mentorId);
    if (isBlocked) {
      throw ApiError.forbidden('Cannot request mentorship from this member.');
    }

    // 2. Fetch mentor details
    const mentor = await userRepository.findAuthenticatedById(input.mentorId);
    if (!mentor || mentor.universityId !== input.universityId) {
      throw ApiError.notFound('Alumni mentor profile');
    }
    if (mentor.role.name !== 'ALUMNI') {
      throw ApiError.badRequest('Mentorship can only be requested from verified Alumni.');
    }

    // 3. Check mentor availability
    if (!mentor.isMentorshipAvailable || mentor.mentorshipStatus !== 'OPEN') {
      throw ApiError.badRequest('This alumni member is not currently accepting new mentees.');
    }

    // 4. Check active mentee capacity limit
    const activeCount = await mentorshipRepository.countActiveMentees(mentor.id);
    const maxCapacity = mentor.maxActiveMentees ?? 5;
    if (activeCount >= maxCapacity) {
      throw ApiError.conflict('Mentor is currently at maximum active mentee capacity.');
    }

    // 5. Prevent duplicate active/pending mentorship
    const existing = await mentorshipRepository.findActiveBetweenUsers(input.studentId, input.mentorId);
    if (existing) {
      throw ApiError.conflict('An active or pending mentorship proposal already exists with this mentor.');
    }

    const created = await mentorshipRepository.createRequest({
      universityId: input.universityId,
      mentorId: input.mentorId,
      menteeId: input.studentId,
      topic: input.topic.trim(),
      careerGoal: input.careerGoal.trim(),
      message: input.message.trim(),
      preferredCommunication: input.preferredCommunication,
      availability: input.availability.trim(),
      expectedDuration: input.expectedDuration?.trim(),
    });

    const studentUser = await userRepository.findAuthenticatedById(input.studentId);
    await notificationService.notifyUser({
      userId: input.mentorId,
      type: 'MENTORSHIP_REQUEST',
      title: 'New Mentorship Proposal',
      body: `${studentUser?.name || 'A student'} submitted a mentorship proposal on "${input.topic}".`,
      link: '/alumni/mentorship/requests',
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.studentId,
      action: 'MENTORSHIP_REQUESTED',
      targetType: 'mentorship_request',
      targetId: created.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
      metadata: { topic: input.topic, mentorId: input.mentorId },
    });

    return mentorshipPresenter.presentItem(created, input.studentId);
  },

  async listMyMentorships(
    userId: string,
    role: 'STUDENT' | 'ALUMNI',
    filters: {
      group?: 'requests' | 'active' | 'history';
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { items, total, page, limit, totalPages } = await mentorshipRepository.listForUser(
      userId,
      role,
      filters,
    );

    return {
      data: mentorshipPresenter.presentList(items, userId),
      meta: { page, limit, total, totalPages },
    };
  },

  async getMentorshipById(id: string, viewerId: string, viewerRole: string) {
    const item = await mentorshipRepository.findById(id);
    if (!item) {
      throw ApiError.notFound('Mentorship session');
    }

    const isParticipant = item.mentorId === viewerId || item.menteeId === viewerId;
    const isStaff = viewerRole === 'SUPER_ADMIN' || viewerRole === 'MODERATOR';
    if (!isParticipant && !isStaff) {
      throw ApiError.forbidden('You do not have access to this mentorship workspace.');
    }

    return mentorshipPresenter.presentItem(item, viewerId);
  },

  async clarifyRequest(input: {
    id: string;
    alumniId: string;
    universityId: string;
    question: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship proposal');
    }
    if (item.mentorId !== input.alumniId) {
      throw ApiError.forbidden('Only the assigned mentor can request clarification.');
    }
    if (item.status !== 'REQUESTED' && item.status !== 'PENDING') {
      throw ApiError.conflict('Clarification can only be requested on pending proposals.');
    }

    const updated = await mentorshipRepository.updateStatus(input.id, 'CLARIFICATION_REQUESTED', {
      clarificationQuestion: input.question.trim(),
    });

    await notificationService.notifyUser({
      userId: item.menteeId,
      type: 'MENTORSHIP_DECISION',
      title: 'Mentorship Clarification Requested',
      body: `${item.mentor?.name || 'Your prospective mentor'} requested clarification on your proposal.`,
      link: '/student/mentorship',
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.alumniId,
      action: 'MENTORSHIP_CLARIFICATION_REQUESTED',
      targetType: 'mentorship_request',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return mentorshipPresenter.presentItem(updated, input.alumniId);
  },

  async replyClarification(input: {
    id: string;
    studentId: string;
    universityId: string;
    reply: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship proposal');
    }
    if (item.menteeId !== input.studentId) {
      throw ApiError.forbidden('Only the student mentee can reply to clarification.');
    }
    if (item.status !== 'CLARIFICATION_REQUESTED') {
      throw ApiError.conflict('Proposal is not awaiting clarification.');
    }

    const updated = await mentorshipRepository.updateStatus(input.id, 'REQUESTED', {
      clarificationReply: input.reply.trim(),
    });

    await notificationService.notifyUser({
      userId: item.mentorId,
      type: 'MENTORSHIP_REQUEST',
      title: 'Clarification Provided',
      body: `${item.mentee?.name || 'Student'} provided clarification on their mentorship inquiry.`,
      link: '/alumni/mentorship/requests',
    });

    return mentorshipPresenter.presentItem(updated, input.studentId);
  },

  async acceptRequest(input: {
    id: string;
    alumniId: string;
    universityId: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship proposal');
    }
    if (item.mentorId !== input.alumniId) {
      throw ApiError.forbidden('Only the prospective mentor can accept this proposal.');
    }
    if (item.status !== 'REQUESTED' && item.status !== 'CLARIFICATION_REQUESTED' && item.status !== 'PENDING') {
      throw ApiError.conflict('Proposal has already been handled or concluded.');
    }

    return prisma.$transaction(async (tx) => {
      // Re-verify capacity inside transaction
      const mentor = await tx.user.findUniqueOrThrow({
        where: { id: input.alumniId },
        select: { maxActiveMentees: true },
      });
      const activeCount = await tx.mentorshipRequest.count({
        where: { mentorId: input.alumniId, status: { in: ['ACTIVE', 'ACCEPTED'] } },
      });
      const maxMentees = mentor.maxActiveMentees ?? 5;
      if (activeCount >= maxMentees) {
        throw ApiError.conflict('You have reached your maximum active mentee capacity.');
      }

      const updated = await tx.mentorshipRequest.update({
        where: { id: input.id },
        data: {
          status: 'ACTIVE',
          startedAt: new Date(),
        },
        include: {
          mentor: {
            select: { id: true, name: true, avatarUrl: true, department: true, currentCompany: true, position: true, email: true },
          },
          mentee: {
            select: { id: true, name: true, avatarUrl: true, department: true, batch: true, email: true },
          },
        },
      });

      // If mentor reaches max capacity, bump directory cache
      if (activeCount + 1 >= maxMentees) {
        await cacheService.bumpVersion('dir');
      }

      await notificationService.notifyUser({
        userId: item.menteeId,
        type: 'MENTORSHIP_DECISION',
        title: 'Mentorship Proposal Accepted!',
        body: `${item.mentor?.name || 'Your mentor'} accepted your proposal. Workspace initialized.`,
        link: '/student/mentorship',
      });

      await auditLogRepository.record({
        universityId: input.universityId,
        actorId: input.alumniId,
        action: 'MENTORSHIP_ACCEPTED',
        targetType: 'mentorship_request',
        targetId: updated.id,
        ip: input.meta?.ip,
        userAgent: input.meta?.userAgent,
        requestId: input.meta?.requestId,
      });

      return mentorshipPresenter.presentItem(updated, input.alumniId);
    });
  },

  async rejectRequest(input: {
    id: string;
    alumniId: string;
    universityId: string;
    reason?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship proposal');
    }
    if (item.mentorId !== input.alumniId) {
      throw ApiError.forbidden('Only the assigned mentor can decline this proposal.');
    }
    if (item.status !== 'REQUESTED' && item.status !== 'CLARIFICATION_REQUESTED' && item.status !== 'PENDING') {
      throw ApiError.conflict('Proposal has already been handled.');
    }

    const updated = await mentorshipRepository.updateStatus(input.id, 'REJECTED', {
      decisionNote: input.reason?.trim() || null,
      endedAt: new Date(),
      endedById: input.alumniId,
      endNote: input.reason?.trim() || 'Declined by mentor.',
    });

    await notificationService.notifyUser({
      userId: item.menteeId,
      type: 'MENTORSHIP_DECISION',
      title: 'Mentorship Proposal Declined',
      body: `${item.mentor?.name || 'Alumni mentor'} was unable to accept your proposal at this time.`,
      link: '/student/mentorship',
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.alumniId,
      action: 'MENTORSHIP_REJECTED',
      targetType: 'mentorship_request',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return mentorshipPresenter.presentItem(updated, input.alumniId);
  },

  async cancelRequest(input: {
    id: string;
    userId: string;
    universityId: string;
    note?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship request');
    }
    if (item.menteeId !== input.userId && item.mentorId !== input.userId) {
      throw ApiError.forbidden('You are not a participant in this mentorship.');
    }

    const updated = await mentorshipRepository.updateStatus(input.id, 'CANCELLED', {
      endedAt: new Date(),
      endedById: input.userId,
      endNote: input.note?.trim() || 'Cancelled by participant.',
    });

    const otherUserId = item.mentorId === input.userId ? item.menteeId : item.mentorId;
    await notificationService.notifyUser({
      userId: otherUserId,
      type: 'MENTORSHIP_DECISION',
      title: 'Mentorship Cancelled',
      body: 'A mentorship inquiry was cancelled.',
      link: item.mentorId === input.userId ? '/student/mentorship' : '/alumni/mentorship/requests',
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.userId,
      action: 'MENTORSHIP_CANCELLED',
      targetType: 'mentorship_request',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return mentorshipPresenter.presentItem(updated, input.userId);
  },

  async endMentorship(input: {
    id: string;
    userId: string;
    universityId: string;
    note?: string;
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship session');
    }
    if (item.menteeId !== input.userId && item.mentorId !== input.userId) {
      throw ApiError.forbidden('You are not a participant in this mentorship.');
    }
    if (item.status !== 'ACTIVE' && item.status !== 'ACCEPTED') {
      throw ApiError.conflict('Only active mentorship partnerships can be completed.');
    }

    const updated = await mentorshipRepository.updateStatus(input.id, 'COMPLETED', {
      endedAt: new Date(),
      endedById: input.userId,
      endNote: input.note?.trim() || 'Mentorship partnership successfully concluded.',
    });

    // Free up a slot -> bump directory cache
    await cacheService.bumpVersion('dir');

    const otherUserId = item.mentorId === input.userId ? item.menteeId : item.mentorId;
    await notificationService.notifyUser({
      userId: otherUserId,
      type: 'MENTORSHIP_DECISION',
      title: 'Mentorship Concluded',
      body: 'Your mentorship collaboration has been concluded.',
      link: item.mentorId === input.userId ? '/student/mentorship' : '/alumni/mentorship/requests',
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.userId,
      action: 'MENTORSHIP_ENDED',
      targetType: 'mentorship_request',
      targetId: updated.id,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return mentorshipPresenter.presentItem(updated, input.userId);
  },

  async updateAlumniNote(input: {
    id: string;
    alumniId: string;
    universityId: string;
    note: string;
    scheduledAt?: Date | null;
  }) {
    const item = await mentorshipRepository.findById(input.id);
    if (!item || item.universityId !== input.universityId) {
      throw ApiError.notFound('Mentorship workspace');
    }
    if (item.mentorId !== input.alumniId) {
      throw ApiError.forbidden('Only the alumni mentor can update private session notes.');
    }

    const updated = await mentorshipRepository.updateAlumniNote(
      input.id,
      input.note,
      input.scheduledAt,
    );
    return mentorshipPresenter.presentItem(updated, input.alumniId);
  },

  async updateAvailability(input: {
    alumniId: string;
    universityId: string;
    status: 'OPEN' | 'CLOSED';
    maxActiveMentees?: number;
    topics?: string[];
    meta?: { ip?: string; userAgent?: string; requestId?: string };
  }) {
    const updatedUser = await prisma.user.update({
      where: { id: input.alumniId },
      data: {
        mentorshipStatus: input.status,
        isMentorshipAvailable: input.status === 'OPEN',
        ...(input.maxActiveMentees !== undefined ? { maxActiveMentees: input.maxActiveMentees } : {}),
        ...(input.topics !== undefined ? { mentorshipTopics: input.topics } : {}),
      },
      select: {
        id: true,
        isMentorshipAvailable: true,
        mentorshipStatus: true,
        maxActiveMentees: true,
        mentorshipTopics: true,
      },
    });

    await cacheService.bumpVersion('dir');

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.alumniId,
      action: 'MENTORSHIP_AVAILABILITY_CHANGED',
      targetType: 'user',
      targetId: input.alumniId,
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
      metadata: { status: input.status, maxActiveMentees: input.maxActiveMentees },
    });

    return updatedUser;
  },

  async getAdminStats(universityId: string) {
    return mentorshipRepository.countPlatformStats(universityId);
  },
};
