import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { reportService } from '../services/report/report.service.js';
import { ApiError } from '../errors/api-error.js';
import type { RoleName } from '../generated/prisma/client.js';

export const reportController = {
  submitReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.submitReport({
      universityId: request.auth.universityId,
      reportedById: request.auth.userId,
      targetType: request.body.targetType,
      targetId: request.body.targetId,
      type: request.body.type,
      reason: request.body.reason,
      details: request.body.details,
      meta: {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string | undefined,
      },
    });

    return sendSuccess(response, {
      statusCode: 201,
      message: 'Report submitted successfully. Thank you for keeping our community safe.',
      data: report,
    });
  }),

  getModeratorReports: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const query = request.query as any;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const result = await reportService.getModeratorReports(
      request.auth.universityId,
      {
        status: query.status,
        type: query.type,
        targetType: query.targetType,
        q: query.q,
        escalated: query.escalated === 'true' ? true : query.escalated === 'false' ? false : undefined,
      },
      { page, limit },
      request.auth.role,
    );

    return sendSuccess(response, {
      data: result.items,
      meta: result.meta,
    });
  }),

  getReportById: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.getReportById(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.auth.role,
    );

    return sendSuccess(response, { data: report });
  }),

  claimReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.claimReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.auth.role as RoleName,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string | undefined,
      },
    );

    return sendSuccess(response, {
      message: 'Report claimed for review.',
      data: report,
    });
  }),

  resolveReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.resolveReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.auth.role as RoleName,
      {
        actionType: request.body.actionType,
        resolutionNote: request.body.resolutionNote,
        restrictionType: request.body.restrictionType,
        durationDays: request.body.durationDays ? Number(request.body.durationDays) : undefined,
        publicMessageToTarget: request.body.publicMessageToTarget,
        meta: {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          requestId: request.headers['x-request-id'] as string | undefined,
        },
      },
    );

    return sendSuccess(response, {
      message: 'Report resolved and sanctions applied.',
      data: report,
    });
  }),

  rejectReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.rejectReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.auth.role as RoleName,
      request.body.resolutionNote,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string | undefined,
      },
    );

    return sendSuccess(response, {
      message: 'Report dismissed as non-violating.',
      data: report,
    });
  }),

  escalateReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.escalateReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.auth.role as RoleName,
    );

    return sendSuccess(response, {
      message: 'Report escalated to Super Admin.',
      data: report,
    });
  }),

  takeOverReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.takeOverReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
    );

    return sendSuccess(response, {
      message: 'Report taken over by Super Admin.',
      data: report,
    });
  }),

  reassignReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.reassignReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.body.moderatorId,
    );

    return sendSuccess(response, {
      message: 'Report reassigned successfully.',
      data: report,
    });
  }),

  overturnReport: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    const report = await reportService.overturnReport(
      request.params.id as string,
      request.auth.universityId,
      request.auth.userId,
      request.body.overturnReason,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string | undefined,
      },
    );

    return sendSuccess(response, {
      message: 'Moderator decision overturned and restrictions vacated.',
      data: report,
    });
  }),

  liftRestriction: asyncHandler(async (request: Request, response: Response) => {
    if (!request.auth) throw ApiError.unauthorized();

    await reportService.liftRestriction(
      request.params.id as string,
      request.auth.userId,
      request.body.revokeReason,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string | undefined,
      },
    );

    return sendSuccess(response, {
      message: 'User restriction revoked successfully.',
    });
  }),
};
