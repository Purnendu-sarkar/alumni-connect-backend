import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import { directoryPresenter, type ConnectionStatusTag } from '../../presenters/directory.presenter.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { directoryRepository, type DirectoryQueryFilters } from '../../repositories/directory.repository.js';
import { cacheService } from '../cache/cache.service.js';
import { privacyService } from '../privacy/privacy.service.js';

export const directoryService = {
  async searchDirectory(
    universityId: string,
    viewer: { id: string; role: string },
    filters: DirectoryQueryFilters,
  ) {
    // If viewer is STUDENT, strictly restrict group to 'alumni'
    const group: 'alumni' | 'students' =
      viewer.role === 'STUDENT' ? 'alumni' : (filters.group ?? 'alumni');

    // 1. Get all user IDs blocked by or blocking this viewer
    const blockedUserIds = await blockRepository.getBlockedUserIds(viewer.id);

    // 2. Fetch candidates matching query filters
    const { candidates, total, page, limit, totalPages } =
      await directoryRepository.searchCandidates(
        universityId,
        group,
        filters,
        [viewer.id, ...blockedUserIds],
      );

    if (candidates.length === 0) {
      return {
        data: [],
        meta: { page, limit, total, totalPages },
      };
    }

    // 3. Batch lookup connections between viewer and candidates
    const candidateIds = candidates.map((c) => c.id);
    const connections = await prisma.connection.findMany({
      where: {
        universityId,
        OR: [
          { requesterId: viewer.id, recipientId: { in: candidateIds } },
          { requesterId: { in: candidateIds }, recipientId: viewer.id },
        ],
      },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        status: true,
      },
    });

    const connectionMap = new Map<string, { status: string; isRequester: boolean }>();
    for (const conn of connections) {
      const otherId = conn.requesterId === viewer.id ? conn.recipientId : conn.requesterId;
      connectionMap.set(otherId, {
        status: conn.status,
        isRequester: conn.requesterId === viewer.id,
      });
    }

    // 4. Map candidates to safe DTO cards
    const maskedCards = candidates.map((candidate) => {
      const connInfo = connectionMap.get(candidate.id);
      let connectionStatus: ConnectionStatusTag = 'NONE';
      if (connInfo?.status === 'ACCEPTED') {
        connectionStatus = 'CONNECTED';
      } else if (connInfo?.status === 'PENDING') {
        connectionStatus = connInfo.isRequester ? 'PENDING_SENT' : 'PENDING_RECEIVED';
      }

      const relationship =
        connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'VERIFIED_MEMBER';

      return directoryPresenter.presentCard(candidate, relationship, connectionStatus);
    });

    return {
      data: maskedCards,
      meta: { page, limit, total, totalPages },
    };
  },

  async getMemberById(universityId: string, viewer: { id: string; role: string }, targetId: string) {
    const member = await directoryRepository.findMemberById(universityId, targetId);
    if (!member) {
      throw ApiError.notFound('Community member profile');
    }

    // Student cannot browse Student directory profiles
    if (viewer.role === 'STUDENT' && member.role?.name === 'STUDENT' && viewer.id !== targetId) {
      throw ApiError.notFound('Community member profile');
    }

    // 1. Check viewer relationship (Block check takes precedence)
    const relationship = await privacyService.getViewerRelationship(viewer.id, targetId, universityId);
    if (relationship === 'BLOCKED') {
      throw ApiError.notFound('Community member profile');
    }

    // 2. Enforce profileVisibility === ONLY_ME
    const privacy = member.privacySetting;
    if (
      privacy?.profileVisibility === 'ONLY_ME' &&
      relationship !== 'SELF' &&
      viewer.role !== 'SUPER_ADMIN' &&
      viewer.role !== 'MODERATOR'
    ) {
      throw ApiError.notFound('Community member profile');
    }

    // 3. Connection status
    let connectionStatus: ConnectionStatusTag = 'NONE';
    if (viewer.id !== targetId) {
      const conn = await connectionRepository.findBetweenUsers(universityId, viewer.id, targetId);
      if (conn) {
        if (conn.status === 'ACCEPTED') {
          connectionStatus = 'CONNECTED';
        } else if (conn.status === 'PENDING') {
          connectionStatus = conn.requesterId === viewer.id ? 'PENDING_SENT' : 'PENDING_RECEIVED';
        }
      }
    }

    // 4. Active mentorship inquiry check
    let activeMentorshipStatus: string | null = null;
    if (viewer.id !== targetId) {
      const mentorship = await prisma.mentorshipRequest.findFirst({
        where: {
          universityId,
          OR: [
            { mentorId: targetId, menteeId: viewer.id },
            { mentorId: viewer.id, menteeId: targetId },
          ],
          status: { in: ['REQUESTED', 'CLARIFICATION_REQUESTED', 'ACTIVE'] },
        },
        select: { status: true },
      });
      activeMentorshipStatus = mentorship?.status ?? null;
    }

    return directoryPresenter.presentDetail(
      member,
      relationship,
      connectionStatus,
      activeMentorshipStatus,
    );
  },
};
