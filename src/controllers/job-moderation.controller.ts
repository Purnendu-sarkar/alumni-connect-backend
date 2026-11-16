import { jobModerationService } from '../services/job/job-moderation.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/api-response.js';
import { toPageMeta } from '../utils/pagination.js';
import type {
  moderationQueueQuerySchema,
  moderatorRejectSchema,
  moderatorRequestChangesSchema,
  adminOverrideSchema,
} from '../validators/job.schema.js';
import type { z } from 'zod';

export const jobModerationController = {
  getQueue: asyncHandler(async (request, response) => {
    const query = request.query as unknown as z.infer<typeof moderationQueueQuerySchema>;
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const [jobs, total] = await jobModerationService.getModerationQueue(
      request.auth!.universityId,
      {
        status: query.status,
        mine: query.mine,
        category: query.category,
        q: query.q,
      },
      { page, limit },
      request.auth!.userId,
    );

    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(page, limit, total),
    });
  }),

  getDetail: asyncHandler(async (request, response) => {
    const detail = await jobModerationService.getModerationJobDetail(
      request.params.id as string,
    );
    return sendSuccess(response, { data: detail });
  }),

  claim: asyncHandler(async (request, response) => {
    const result = await jobModerationService.claimJob(
      request.params.id as string,
      request.auth!.universityId,
      request.auth!.userId,
    );

    return sendSuccess(response, {
      message: 'Job listing claimed for review.',
      data: result,
    });
  }),

  unclaim: asyncHandler(async (request, response) => {
    const isSuperAdmin = request.auth!.role === 'SUPER_ADMIN';
    const result = await jobModerationService.unclaimJob(
      request.params.id as string,
      request.auth!.universityId,
      request.auth!.userId,
      isSuperAdmin,
    );

    return sendSuccess(response, {
      message: 'Review claim released back to the institutional queue.',
      data: result,
    });
  }),

  approve: asyncHandler(async (request, response) => {
    const job = await jobModerationService.approveJob(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
      request.auth!.universityId,
    );

    return sendSuccess(response, {
      message: 'Job listing approved and published to the campus board.',
      data: job,
    });
  }),

  reject: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof moderatorRejectSchema>;
    const job = await jobModerationService.rejectJob(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
      request.auth!.universityId,
      body,
    );

    return sendSuccess(response, {
      message: 'Job listing declined with feedback delivered to author.',
      data: job,
    });
  }),

  requestChanges: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof moderatorRequestChangesSchema>;
    const job = await jobModerationService.requestChanges(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.role,
      request.auth!.universityId,
      body,
    );

    return sendSuccess(response, {
      message: 'Revisions requested. Notification dispatched to job poster.',
      data: job,
    });
  }),

  adminOverride: asyncHandler(async (request, response) => {
    const body = request.body as z.infer<typeof adminOverrideSchema>;
    const job = await jobModerationService.adminOverride(
      request.params.id as string,
      request.auth!.userId,
      request.auth!.universityId,
      body,
    );

    return sendSuccess(response, {
      message: `Administrative override executed successfully (${body.action}).`,
      data: job,
    });
  }),

  getAdminJobs: asyncHandler(async (request, response) => {
    const query = request.query as { status?: string; q?: string; page?: string; limit?: string };
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);

    const [jobs, total] = await jobModerationService.getAdminJobs(
      request.auth!.universityId,
      { status: query.status, q: query.q },
      { page, limit },
    );

    return sendSuccess(response, {
      data: jobs,
      meta: toPageMeta(page, limit, total),
    });
  }),
};
