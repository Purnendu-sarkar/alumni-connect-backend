import type { Report, ReportAction, UserRestriction } from '../generated/prisma/client.js';
import type { PageMeta } from '../utils/api-response.js';

export interface FormattedReportUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface FormattedReportAction {
  id: string;
  reportId: string;
  actor: {
    id: string;
    name: string;
    role: string;
  };
  actorRole: string;
  actionType: string;
  note: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface FormattedReportResponse {
  id: string;
  universityId: string;
  targetType: string;
  targetId: string;
  type: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolutionNote: string | null;
  snapshot: unknown;
  claimedAt: string | null;
  escalatedAt: string | null;
  overturnedAt: string | null;
  overturnedById: string | null;
  overturnReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reportedBy?: FormattedReportUser | null;
  reportedUser?: FormattedReportUser | null;
  reviewer?: FormattedReportUser | null;
  resolver?: FormattedReportUser | null;
  linkedReportsCount?: number;
  actions?: FormattedReportAction[];
  activeRestrictions?: UserRestriction[];
}

export const reportPresenter = {
  toReportResponse(
    report: any,
    options: {
      viewerId?: string;
      viewerRole?: string;
      linkedReportsCount?: number;
      activeRestrictions?: UserRestriction[];
    } = {},
  ): FormattedReportResponse {
    const isStaff = options.viewerRole === 'MODERATOR' || options.viewerRole === 'SUPER_ADMIN';
    const isReporter = options.viewerId && options.viewerId === report.reportedById;

    // Reporter Anonymity: never reveal reporter identity to non-staff non-reporters
    let reportedByInfo: FormattedReportUser | null = null;
    if (isStaff || isReporter) {
      if (report.reportedBy) {
        reportedByInfo = {
          id: report.reportedBy.id,
          name: report.reportedBy.name,
          email: report.reportedBy.email,
          role: report.reportedBy.role?.name || 'STUDENT',
        };
      }
    }

    return {
      id: report.id,
      universityId: report.universityId,
      targetType: report.targetType,
      targetId: report.targetId,
      type: report.type,
      reason: report.reason,
      status: report.status,
      resolution: report.resolution,
      resolutionNote: report.resolutionNote,
      snapshot: report.snapshot ?? null,
      claimedAt: report.claimedAt ? report.claimedAt.toISOString() : null,
      escalatedAt: report.escalatedAt ? report.escalatedAt.toISOString() : null,
      overturnedAt: report.overturnedAt ? report.overturnedAt.toISOString() : null,
      overturnedById: report.overturnedById,
      overturnReason: report.overturnReason,
      resolvedAt: report.resolvedAt ? report.resolvedAt.toISOString() : null,
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
      reportedBy: reportedByInfo,
      reportedUser: report.reportedUser
        ? {
            id: report.reportedUser.id,
            name: report.reportedUser.name,
            email: report.reportedUser.email,
            role: report.reportedUser.role?.name || 'STUDENT',
          }
        : null,
      reviewer: report.reviewer
        ? {
            id: report.reviewer.id,
            name: report.reviewer.name,
            email: report.reviewer.email,
            role: report.reviewer.role?.name || 'MODERATOR',
          }
        : null,
      resolver: report.resolver
        ? {
            id: report.resolver.id,
            name: report.resolver.name,
            email: report.resolver.email,
            role: report.resolver.role?.name || 'MODERATOR',
          }
        : null,
      linkedReportsCount: options.linkedReportsCount ?? 0,
      actions: report.actions
        ? report.actions.map((act: any) => ({
            id: act.id,
            reportId: act.reportId,
            actor: {
              id: act.actor?.id || act.actorId,
              name: act.actor?.name || 'Staff Member',
              role: act.actor?.role?.name || act.actorRole,
            },
            actorRole: act.actorRole,
            actionType: act.actionType,
            note: act.note,
            metadata: act.metadata,
            createdAt: act.createdAt.toISOString(),
          }))
        : [],
      activeRestrictions: options.activeRestrictions ?? [],
    };
  },

  toReportListResponse(
    reports: any[],
    meta: PageMeta,
    viewerRole?: string,
  ) {
    const isStaff = viewerRole === 'MODERATOR' || viewerRole === 'SUPER_ADMIN';

    return {
      items: reports.map((rep) => ({
        id: rep.id,
        universityId: rep.universityId,
        targetType: rep.targetType,
        targetId: rep.targetId,
        type: rep.type,
        reason: rep.reason,
        status: rep.status,
        resolutionNote: rep.resolutionNote,
        snapshot: rep.snapshot,
        claimedAt: rep.claimedAt ? rep.claimedAt.toISOString() : null,
        escalatedAt: rep.escalatedAt ? rep.escalatedAt.toISOString() : null,
        overturnedAt: rep.overturnedAt ? rep.overturnedAt.toISOString() : null,
        resolvedAt: rep.resolvedAt ? rep.resolvedAt.toISOString() : null,
        createdAt: rep.createdAt.toISOString(),
        actionsCount: rep._count?.actions ?? 0,
        reportedBy: isStaff && rep.reportedBy
          ? {
              id: rep.reportedBy.id,
              name: rep.reportedBy.name,
              role: rep.reportedBy.role?.name || 'STUDENT',
            }
          : null,
        reportedUser: rep.reportedUser
          ? {
              id: rep.reportedUser.id,
              name: rep.reportedUser.name,
              role: rep.reportedUser.role?.name || 'STUDENT',
            }
          : null,
        reviewer: rep.reviewer
          ? {
              id: rep.reviewer.id,
              name: rep.reviewer.name,
              role: rep.reviewer.role?.name || 'MODERATOR',
            }
          : null,
      })),
      meta,
    };
  },
};
