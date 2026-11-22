import { prisma } from '../../config/database.js';
import { ApiError } from '../../errors/api-error.js';
import type { Prisma, ReportStatus, ReportType, RestrictionType, RoleName } from '../../generated/prisma/client.js';
import { auditLogRepository } from '../../repositories/audit-log.repository.js';
import { reportRepository, type ReportFilterOptions } from '../../repositories/report.repository.js';
import { restrictionRepository } from '../../repositories/restriction.repository.js';
import { reportPresenter } from '../../presenters/report.presenter.js';
import { notificationService } from '../notification/notification.service.js';
import { cacheService } from '../cache/cache.service.js';
import { toPageMeta } from '../../utils/pagination.js';

export interface SubmitReportInput {
  universityId: string;
  reportedById: string;
  targetType: 'USER' | 'JOB' | 'STORY' | 'MESSAGE' | 'EVENT';
  targetId: string;
  type: ReportType;
  reason: string;
  details?: string;
  meta?: { ip?: string; userAgent?: string; requestId?: string };
}

export interface ResolveReportInput {
  actionType: 'NONE' | 'HIDE_CONTENT' | 'WARN_USER' | 'RESTRICT_USER' | 'ESCALATE';
  resolutionNote: string;
  restrictionType?: RestrictionType;
  durationDays?: number;
  publicMessageToTarget?: string;
  meta?: { ip?: string; userAgent?: string; requestId?: string };
}

export const reportService = {
  async submitReport(input: SubmitReportInput) {
    let reportedUserId: string | null = null;
    let snapshot: Prisma.InputJsonValue = {};

    switch (input.targetType) {
      case 'USER': {
        const targetUser = await prisma.user.findFirst({
          where: { id: input.targetId, universityId: input.universityId },
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            headline: true,
            bio: true,
            verificationStatus: true,
            role: { select: { name: true } },
            department: true,
          },
        });
        if (!targetUser) {
          throw ApiError.notFound('User to report');
        }
        reportedUserId = targetUser.id;
        snapshot = {
          userId: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role?.name,
          department: targetUser.department,
          headline: targetUser.headline,
          bio: targetUser.bio,
          avatarUrl: targetUser.avatarUrl,
          verificationStatus: targetUser.verificationStatus,
        };
        break;
      }

      case 'JOB': {
        const targetJob = await prisma.job.findFirst({
          where: { id: input.targetId, universityId: input.universityId },
          select: {
            id: true,
            title: true,
            company: true,
            description: true,
            requirements: true,
            employmentType: true,
            workMode: true,
            location: true,
            salaryMin: true,
            salaryMax: true,
            salaryCurrency: true,
            status: true,
            postedById: true,
            postedBy: { select: { id: true, name: true, email: true } },
          },
        });
        if (!targetJob) {
          throw ApiError.notFound('Job listing to report');
        }
        reportedUserId = targetJob.postedById;
        snapshot = {
          jobId: targetJob.id,
          title: targetJob.title,
          company: targetJob.company,
          description: targetJob.description,
          requirements: targetJob.requirements,
          employmentType: targetJob.employmentType,
          workMode: targetJob.workMode,
          location: targetJob.location,
          salaryRange:
            targetJob.salaryMin && targetJob.salaryMax
              ? `${targetJob.salaryMin} - ${targetJob.salaryMax} ${targetJob.salaryCurrency}`
              : 'Negotiable',
          status: targetJob.status,
          postedBy: targetJob.postedBy,
        };
        break;
      }

      case 'STORY': {
        const targetStory = await prisma.successStory.findFirst({
          where: { id: input.targetId, universityId: input.universityId },
          select: {
            id: true,
            title: true,
            excerpt: true,
            content: true,
            category: true,
            status: true,
            authorId: true,
            author: { select: { id: true, name: true, email: true } },
          },
        });
        if (!targetStory) {
          throw ApiError.notFound('Success story to report');
        }
        reportedUserId = targetStory.authorId;
        snapshot = {
          storyId: targetStory.id,
          title: targetStory.title,
          excerpt: targetStory.excerpt,
          content: targetStory.content,
          category: targetStory.category,
          status: targetStory.status,
          author: targetStory.author,
        };
        break;
      }

      case 'MESSAGE': {
        const targetMessage = await prisma.message.findFirst({
          where: { id: input.targetId },
          select: {
            id: true,
            conversationId: true,
            senderId: true,
            content: true,
            type: true,
            attachmentUrl: true,
            attachmentName: true,
            createdAt: true,
            sender: { select: { id: true, name: true, email: true, universityId: true } },
          },
        });
        if (!targetMessage || targetMessage.sender?.universityId !== input.universityId) {
          throw ApiError.notFound('Message to report');
        }
        reportedUserId = targetMessage.senderId;
        snapshot = {
          messageId: targetMessage.id,
          conversationId: targetMessage.conversationId,
          content: targetMessage.content,
          type: targetMessage.type,
          attachmentUrl: targetMessage.attachmentUrl,
          attachmentName: targetMessage.attachmentName,
          sentAt: targetMessage.createdAt.toISOString(),
          sender: {
            id: targetMessage.sender.id,
            name: targetMessage.sender.name,
          },
        };
        break;
      }

      case 'EVENT': {
        const targetEvent = await prisma.event.findFirst({
          where: { id: input.targetId, universityId: input.universityId },
          select: {
            id: true,
            title: true,
            description: true,
            venue: true,
            status: true,
            startsAt: true,
            createdById: true,
            organizer: true,
            createdBy: { select: { id: true, name: true, email: true } },
          },
        });
        if (!targetEvent) {
          throw ApiError.notFound('Event to report');
        }
        reportedUserId = targetEvent.createdById;
        snapshot = {
          eventId: targetEvent.id,
          title: targetEvent.title,
          description: targetEvent.description,
          venue: targetEvent.venue,
          status: targetEvent.status,
          startsAt: targetEvent.startsAt.toISOString(),
          organizer: targetEvent.organizer,
          createdBy: targetEvent.createdBy,
        };
        break;
      }

      default:
        throw ApiError.badRequest('Invalid target type.');
    }

    // Anti-Abuse: Prevent self-reporting
    if (reportedUserId && reportedUserId === input.reportedById) {
      throw new ApiError(422, 'You cannot report your own content or account.', 'CANNOT_REPORT_SELF');
    }

    // Anti-Abuse: Prevent duplicate open reports on same target by same user
    const existing = await reportRepository.findOpenReportByTarget(
      input.reportedById,
      input.targetType,
      input.targetId,
    );
    if (existing) {
      throw new ApiError(409, 'You already have an open report filed for this item.', 'DUPLICATE_REPORT');
    }

    const fullReason = input.details?.trim()
      ? `${input.reason.trim()} - Details: ${input.details.trim()}`
      : input.reason.trim();

    const report = await reportRepository.create({
      universityId: input.universityId,
      reportedById: input.reportedById,
      reportedUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      type: input.type,
      reason: fullReason,
      snapshot,
    });

    await auditLogRepository.record({
      universityId: input.universityId,
      actorId: input.reportedById,
      action: 'REPORT_SUBMITTED',
      targetType: 'report',
      targetId: report.id,
      metadata: { targetType: input.targetType, targetId: input.targetId, type: input.type },
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    // Invalidate moderation queues
    await cacheService.delPattern('stats:*');

    // Notify staff
    await notificationService.notifyRoles({
      universityId: input.universityId,
      roles: ['MODERATOR', 'SUPER_ADMIN'],
      type: 'MODERATION_RESULT',
      title: 'New Incident Report Filed',
      body: `A new community safety report has been submitted regarding a ${input.targetType.toLowerCase()}.`,
      link: '/moderator/reports',
      metadata: { reportId: report.id, targetType: input.targetType },
    });

    return reportPresenter.toReportResponse(report, {
      viewerId: input.reportedById,
      viewerRole: 'STUDENT',
    });
  },

  async getModeratorReports(
    universityId: string,
    filters: ReportFilterOptions,
    pagination: { page: number; limit: number },
    viewerRole: string,
  ) {
    const { total, reports } = await reportRepository.findPaginated(
      universityId,
      filters,
      pagination,
    );
    const meta = toPageMeta(pagination.page, pagination.limit, total);
    return reportPresenter.toReportListResponse(reports, meta, viewerRole);
  },

  async getReportById(
    id: string,
    universityId: string,
    viewerId: string,
    viewerRole: string,
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) {
      throw ApiError.notFound('Report');
    }

    const linkedReportsCount = await reportRepository.countLinkedReports(
      report.targetType,
      report.targetId,
      report.id,
    );

    let activeRestrictions: any[] = [];
    if (report.reportedUserId) {
      activeRestrictions = await restrictionRepository.findActiveRestrictionsByUser(
        report.reportedUserId,
      );
    }

    return reportPresenter.toReportResponse(report, {
      viewerId,
      viewerRole,
      linkedReportsCount,
      activeRestrictions,
    });
  },

  async claimReport(
    id: string,
    universityId: string,
    actorId: string,
    actorRole: RoleName,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) {
      throw ApiError.notFound('Report');
    }

    if (report.status === 'RESOLVED' || report.status === 'REJECTED') {
      throw ApiError.conflict('Cannot claim an already resolved or rejected report.');
    }

    const updated = await reportRepository.update(id, {
      status: 'UNDER_REVIEW',
      reviewer: { connect: { id: actorId } },
      claimedAt: new Date(),
    });

    await reportRepository.createAction({
      reportId: id,
      actorId,
      actorRole,
      actionType: 'CLAIM',
      note: 'Report claimed for formal investigation.',
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'REPORT_CLAIMED',
      targetType: 'report',
      targetId: id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: actorId,
      viewerRole: actorRole,
    });
  },

  async resolveReport(
    id: string,
    universityId: string,
    actorId: string,
    actorRole: RoleName,
    input: ResolveReportInput,
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) {
      throw ApiError.notFound('Report');
    }

    // Execute content moderation action
    if (input.actionType === 'HIDE_CONTENT') {
      if (report.targetType === 'JOB') {
        await prisma.job.updateMany({
          where: { id: report.targetId, universityId },
          data: { status: 'CLOSED' },
        });
        await cacheService.bumpVersion('jobs');
      } else if (report.targetType === 'STORY') {
        await prisma.successStory.updateMany({
          where: { id: report.targetId, universityId },
          data: { status: 'DRAFT' },
        });
        await cacheService.bumpVersion('stories');
      } else if (report.targetType === 'MESSAGE') {
        await prisma.message.updateMany({
          where: { id: report.targetId },
          data: { deletedForEveryone: true },
        });
      }
    }

    // Apply temporary restriction
    if (input.actionType === 'RESTRICT_USER' && report.reportedUserId && input.restrictionType) {
      const durationDays = input.durationDays || 3;
      const endsAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

      await restrictionRepository.createRestriction({
        universityId,
        userId: report.reportedUserId,
        type: input.restrictionType,
        reason: input.resolutionNote,
        endsAt,
        createdById: actorId,
        sourceReportId: report.id,
      });

      // Cache restriction in Redis
      await cacheService.set(
        `restr:${report.reportedUserId}:${input.restrictionType}`,
        { endsAt: endsAt.toISOString() },
        durationDays * 24 * 60 * 60,
      );

      // Anonymized notification to the restricted user (zero mention of reporter)
      await notificationService.notifyUser({
        userId: report.reportedUserId,
        type: 'RESTRICTION_APPLIED',
        title: 'Campus Account Privileges Restricted',
        body: `Your access to ${input.restrictionType.toLowerCase()} has been temporarily restricted for ${durationDays} days due to a code-of-conduct review: ${input.resolutionNote}`,
        link: '/student/profile',
      });
    }

    // Send warning to reported user (anonymized)
    if (input.actionType === 'WARN_USER' && report.reportedUserId) {
      await notificationService.notifyUser({
        userId: report.reportedUserId,
        type: 'MODERATION_RESULT',
        title: 'Community Guidelines Advisory',
        body: input.publicMessageToTarget || `A formal notice has been issued regarding campus safety: ${input.resolutionNote}`,
        link: '/student/profile',
      });
    }

    // Escalate to Super Admin
    if (input.actionType === 'ESCALATE') {
      await notificationService.notifyRoles({
        universityId,
        roles: ['SUPER_ADMIN'],
        type: 'MODERATION_RESULT',
        title: 'Incident Report Escalated',
        body: `A report regarding ${report.targetType} #${report.id} was escalated for executive oversight.`,
        link: `/admin/reports/${report.id}`,
      });
    }

    const updated = await reportRepository.update(id, {
      status: input.actionType === 'ESCALATE' ? 'ESCALATED' : 'RESOLVED',
      resolver: { connect: { id: actorId } },
      resolvedAt: new Date(),
      resolution: input.actionType,
      resolutionNote: input.resolutionNote,
      escalatedAt: input.actionType === 'ESCALATE' ? new Date() : undefined,
    });

    await reportRepository.createAction({
      reportId: id,
      actorId,
      actorRole,
      actionType: input.actionType,
      note: input.resolutionNote,
      metadata: {
        restrictionType: input.restrictionType,
        durationDays: input.durationDays,
      },
    });

    // Notify original reporter that their report has been reviewed and resolved
    await notificationService.notifyUser({
      userId: report.reportedById,
      type: 'MODERATION_RESULT',
      title: 'Incident Report Update',
      body: 'Thank you for helping keep our university community safe. Your report has been investigated and resolved by university staff.',
      link: '/student/notifications',
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'REPORT_RESOLVED',
      targetType: 'report',
      targetId: id,
      metadata: { actionType: input.actionType, resolutionNote: input.resolutionNote },
      ip: input.meta?.ip,
      userAgent: input.meta?.userAgent,
      requestId: input.meta?.requestId,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: actorId,
      viewerRole: actorRole,
    });
  },

  async rejectReport(
    id: string,
    universityId: string,
    actorId: string,
    actorRole: RoleName,
    resolutionNote: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) {
      throw ApiError.notFound('Report');
    }

    const updated = await reportRepository.update(id, {
      status: 'REJECTED',
      resolver: { connect: { id: actorId } },
      resolvedAt: new Date(),
      resolution: 'DISMISSED',
      resolutionNote,
    });

    await reportRepository.createAction({
      reportId: id,
      actorId,
      actorRole,
      actionType: 'REJECT',
      note: resolutionNote,
    });

    await notificationService.notifyUser({
      userId: report.reportedById,
      type: 'MODERATION_RESULT',
      title: 'Incident Report Closed',
      body: 'Your incident report was reviewed. After investigation, no guideline violation was found at this time.',
      link: '/student/notifications',
    });

    await auditLogRepository.record({
      universityId,
      actorId,
      action: 'REPORT_REJECTED',
      targetType: 'report',
      targetId: id,
      metadata: { resolutionNote },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: actorId,
      viewerRole: actorRole,
    });
  },

  async escalateReport(
    id: string,
    universityId: string,
    actorId: string,
    actorRole: RoleName,
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) throw ApiError.notFound('Report');

    const updated = await reportRepository.update(id, {
      status: 'ESCALATED',
      escalatedAt: new Date(),
    });

    await reportRepository.createAction({
      reportId: id,
      actorId,
      actorRole,
      actionType: 'ESCALATE',
      note: 'Escalated by moderator for Super Admin intervention.',
    });

    await notificationService.notifyRoles({
      universityId,
      roles: ['SUPER_ADMIN'],
      type: 'MODERATION_RESULT',
      title: 'Incident Report Escalated',
      body: `Incident report #${report.id} was escalated for executive oversight.`,
      link: `/admin/reports/${report.id}`,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: actorId,
      viewerRole: actorRole,
    });
  },

  async takeOverReport(id: string, universityId: string, adminId: string) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) throw ApiError.notFound('Report');

    const updated = await reportRepository.update(id, {
      status: 'UNDER_REVIEW',
      reviewer: { connect: { id: adminId } },
      claimedAt: new Date(),
    });

    await reportRepository.createAction({
      reportId: id,
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      actionType: 'TAKE_OVER',
      note: 'Executive administrative oversight assumed.',
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: adminId,
      viewerRole: 'SUPER_ADMIN',
    });
  },

  async reassignReport(
    id: string,
    universityId: string,
    adminId: string,
    moderatorId: string,
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) throw ApiError.notFound('Report');

    const modUser = await prisma.user.findFirst({
      where: { id: moderatorId, universityId },
      include: { role: true },
    });
    if (!modUser || (modUser.role.name !== 'MODERATOR' && modUser.role.name !== 'SUPER_ADMIN')) {
      throw ApiError.badRequest('Assigned user must be a moderator or admin in this university.');
    }

    const updated = await reportRepository.update(id, {
      reviewer: { connect: { id: moderatorId } },
      claimedAt: new Date(),
      status: 'UNDER_REVIEW',
    });

    await reportRepository.createAction({
      reportId: id,
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      actionType: 'REASSIGN',
      note: `Reassigned to moderator ${modUser.name} (${modUser.email}).`,
    });

    await notificationService.notifyUser({
      userId: moderatorId,
      type: 'MODERATION_RESULT',
      title: 'Report Assigned to You',
      body: `Incident report #${report.id} has been reassigned to your queue by Super Admin.`,
      link: `/moderator/reports/${report.id}`,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: adminId,
      viewerRole: 'SUPER_ADMIN',
    });
  },

  async overturnReport(
    id: string,
    universityId: string,
    adminId: string,
    overturnReason: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const report = await reportRepository.findById(id, universityId);
    if (!report) throw ApiError.notFound('Report');

    // Revoke any active restrictions tied to this report
    await restrictionRepository.revokeBySourceReport(
      report.id,
      adminId,
      `Overturned by Super Admin: ${overturnReason}`,
    );

    // If target was a Job or Story that was closed/hidden, optionally restore
    if (report.targetType === 'JOB') {
      await prisma.job.updateMany({
        where: { id: report.targetId, universityId },
        data: { status: 'PUBLISHED' },
      });
      await cacheService.bumpVersion('jobs');
    } else if (report.targetType === 'STORY') {
      await prisma.successStory.updateMany({
        where: { id: report.targetId, universityId },
        data: { status: 'PUBLISHED' },
      });
      await cacheService.bumpVersion('stories');
    }

    const updated = await reportRepository.update(id, {
      status: 'REVIEWED',
      overturnedAt: new Date(),
      overturnedById: adminId,
      overturnReason,
    });

    await reportRepository.createAction({
      reportId: id,
      actorId: adminId,
      actorRole: 'SUPER_ADMIN',
      actionType: 'OVERTURN',
      note: overturnReason,
    });

    // Notify original reviewer / resolver if present
    const staffId = report.resolverId || report.reviewerId;
    if (staffId && staffId !== adminId) {
      await notificationService.notifyUser({
        userId: staffId,
        type: 'MODERATION_RESULT',
        title: 'Moderator Decision Overturned',
        body: `Your resolution on report #${report.id} was overturned by Super Admin: ${overturnReason}`,
        link: `/moderator/reports/${report.id}`,
      });
    }

    // If reported user had been penalized, notify them that restriction was lifted
    if (report.reportedUserId) {
      await notificationService.notifyUser({
        userId: report.reportedUserId,
        type: 'RESTRICTION_ENDED',
        title: 'Moderation Action Overturned',
        body: 'Upon administrative review, previously applied restrictions have been vacated and your account standing is fully restored.',
        link: '/student/profile',
      });
    }

    await auditLogRepository.record({
      universityId,
      actorId: adminId,
      action: 'REPORT_OVERTURNED',
      targetType: 'report',
      targetId: id,
      metadata: { overturnReason },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });

    return reportPresenter.toReportResponse(updated, {
      viewerId: adminId,
      viewerRole: 'SUPER_ADMIN',
    });
  },

  async liftRestriction(
    restrictionId: string,
    adminId: string,
    revokeReason: string,
    meta?: { ip?: string; userAgent?: string; requestId?: string },
  ) {
    const restriction = await restrictionRepository.findById(restrictionId);
    if (!restriction) throw ApiError.notFound('User restriction');

    await restrictionRepository.revokeRestriction(restrictionId, adminId, revokeReason);

    // Clear Redis restriction cache
    await cacheService.del(`restr:${restriction.userId}:${restriction.type}`);

    await notificationService.notifyUser({
      userId: restriction.userId,
      type: 'RESTRICTION_ENDED',
      title: 'Restriction Lifted',
      body: `Your ${restriction.type.toLowerCase()} privileges have been restored: ${revokeReason}`,
      link: '/student/profile',
    });

    await auditLogRepository.record({
      universityId: restriction.universityId,
      actorId: adminId,
      action: 'RESTRICTION_LIFTED',
      targetType: 'user_restriction',
      targetId: restrictionId,
      metadata: { revokeReason, restrictionType: restriction.type },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      requestId: meta?.requestId,
    });

    return { success: true };
  },
};
