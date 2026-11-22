import type { PrivacyScope, PrivacySetting } from '../../generated/prisma/client.js';

import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { blockRepository } from '../../repositories/block.repository.js';
import { connectionRepository } from '../../repositories/connection.repository.js';
import { privacyRepository } from '../../repositories/privacy.repository.js';
import { cacheService } from '../cache/cache.service.js';

export type ViewerRelationship = 'SELF' | 'CONNECTED' | 'VERIFIED_MEMBER' | 'BLOCKED';

export const privacyService = {
  async getViewerRelationship(
    viewerId: string,
    targetId: string,
    universityId: string,
  ): Promise<ViewerRelationship> {
    if (viewerId === targetId) return 'SELF';

    // 1. Check bidirectional block
    const block = await blockRepository.findBlock(viewerId, targetId);
    if (block) return 'BLOCKED';

    // 2. Check connection status
    const conn = await connectionRepository.findBetweenUsers(universityId, viewerId, targetId);
    if (conn && conn.status === 'ACCEPTED') {
      return 'CONNECTED';
    }

    return 'VERIFIED_MEMBER';
  },

  getMyPrivacy(userId: string) {
    return privacyRepository.getOrCreateDefault(userId);
  },

  async updateMyPrivacy(
    userId: string,
    universityId: string,
    data: Partial<PrivacySetting>,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const updated = await privacyRepository.update(userId, data);
    await cacheService.bumpVersion('dir');
    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'PRIVACY_SETTING_CHANGED',
      targetType: 'privacy_setting',
      targetId: updated.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: data,
    });
    return updated;
  },

  async resetPrivacyDefaults(
    userId: string,
    universityId: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const reset = await privacyRepository.resetDefaults(userId);
    await cacheService.bumpVersion('dir');
    await auditLogRepository.record({
      universityId,
      actorId: userId,
      action: 'PRIVACY_SETTING_CHANGED',
      targetType: 'privacy_setting',
      targetId: reset.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
      metadata: { action: 'RESET_TO_DEFAULTS' },
    });
    return reset;
  },

  isFieldVisible(scope: PrivacyScope | string | null | undefined, relationship: ViewerRelationship): boolean {
    if (relationship === 'BLOCKED') return false;
    if (relationship === 'SELF') return true;

    const actualScope = scope ?? 'ALL_MEMBERS';
    if (actualScope === 'PUBLIC' || actualScope === 'ALL_MEMBERS') return true;
    if (actualScope === 'CONNECTIONS_ONLY') return relationship === 'CONNECTED';
    if (actualScope === 'ONLY_ME') return false;
    return false;
  },
};
